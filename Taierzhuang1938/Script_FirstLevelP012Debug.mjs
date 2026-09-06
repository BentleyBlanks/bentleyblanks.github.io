// Explicit menu-only completion of one P012 beat. Never used by normal Update.
// Keep the existing actors, finite wave ledger, casualty and litter identities.
import { P012_BEATS, P012_WAVES } from "./Script_FirstLevelP012Flow.mjs";
import { P012RouteProjection, P012RoutePoint } from "./Script_FirstLevelP012March.mjs";

export class FirstLevelP012Debug {
  constructor(host) { this.host = host; this.busy = false; }
  State() {
    const g = this.host.Get(), flow = g.flow;
    if (!flow) return null;
    return { current: P012_BEATS[flow.beat], next: P012_BEATS[flow.beat + 1] || null,
      enabled: !this.busy && this.host.CanAdvance() && flow.beat < P012_BEATS.length - 1 };
  }
  Action(id) {
    const { interact, player, carry } = this.host.Get(), point = interact.Point(id);
    if (!point) throw new Error(`Missing P012 debug interaction: ${id}`);
    if (!carry.Active) carry.lockS = 0;
    // Use the original completion callback, including supplies, carry and hooks.
    if (point.OnComplete?.(interact.Context(point, player, 0)) === false)
      throw new Error(`P012 debug interaction rejected: ${id}`);
    point.count++;
    if (point.once) interact.points.delete(id);
  }
  Signal(...names) { for (const name of names) this.host.Get().flow.Emit(name); }
  Mark(...names) { for (const name of names) this.host.Get().flow.Mark(name); }
  Squad(point) {
    const {runtime}=this.host.Get();
    for (const entry of runtime.openingCast || []) {
      runtime.host.ReleaseDefense?.(entry.actor);
      this.host.MoveActor(entry.actor,this.host.ClearPosition(point,entry.actor));
    }
    runtime.defenders=null;
  }
  Settle() { this.host.Get().setpieces.Update(0); }
  Dialogue() {
    const { story, flow } = this.host.Get();
    // Consume only already-triggered cues, deliver their completion receipts and
    // voice hooks without replaying skipped speech over the next objective.
    story.audio?.StopStoryVoice();
    if (story.p012PendingCompletion) {
      story.Signal(story.p012PendingCompletion.signal);
      story.p012CompletedSignals.add(story.p012PendingCompletion.signal);
      story.p012PendingCompletion = null;
    }
    const Consume = beat => {
      beat.done = true;
      story.fired.push({ ...beat, debugSkipped: true });
      if (beat.p012CompleteSignal) {
        story.Signal(beat.p012CompleteSignal);
        story.p012CompletedSignals.add(beat.p012CompleteSignal);
      }
    };
    // Completion signals can trigger another cue in the same conversation.
    for (let pass = 0; pass <= (story.p012Immediate?.length || 0); pass++) {
      const ready = (story.p012Immediate || []).filter(beat => !beat.done
        && story.Signalled(beat.p012Immediate.event));
      if (!ready.length) break;
      for (const beat of ready) {
        Consume(beat);
        story.p012CueLog.push({ key: beat.voice, time: story.levelTime, debugSkipped: true });
      }
    }
    while (story.index < story.queue.length) {
      const beat = story.queue[story.index];
      if (Number.isFinite(beat.p012Beat) && beat.p012Beat > flow.beat) break;
      if (beat.at?.startsWith("event:") && !story.Signalled(beat.at.slice(6))) break;
      if (beat.at?.startsWith("zone:") || beat.at === "end") break;
      Consume(beat); story.index++;
    }
    story.sinceLast = 0; story.beatWait = 0; story.p012SubtitleActiveUntil = 0;
    this.Settle();
  }
  Wave(index, resolve = false) {
    const { flow } = this.host.Get(), wave = P012_WAVES[index];
    if (!flow.unlockedWaves.includes(index)) {
      flow.unlockedWaves.push(index); flow.SpawnWave(wave, index);
      flow.lastWaveAt = flow.elapsed;
      if (!resolve) flow.host.Pressure?.(wave);
    }
    if (resolve) {
      // Pending members also consume the same finite budget, even if an earlier
      // encounter had filled the live actor cap when this wave was requested.
      for (let pass = 0; pass <= wave.count; pass++) {
        for (const entry of flow.enemyRoutes.filter(entry => entry.encounterBeat <= wave.beat))
          if (entry.handle?.alive) this.host.KillEnemy(entry.handle);
        flow.SpawnPending();
        if (!flow.pendingEnemies.some(entry => entry.encounterBeat <= wave.beat)) {
          for (const entry of flow.enemyRoutes.filter(entry => entry.encounterBeat <= wave.beat))
            if (entry.handle?.alive) this.host.KillEnemy(entry.handle);
          break;
        }
      }
    }
  }
  Column(point) {
    const { setpieces } = this.host.Get(), column = setpieces.mem.column;
    if (!column?.started) throw new Error("P012 escort has not started");
    const route = column.waypoints, projection = P012RouteProjection(route, point);
    column.legIndex = projection.index; column.legT = projection.along
      - P012RouteProjection(route, route[projection.index]).along;
    const end = route.at(-1);
    column.arrived = Math.hypot(point.x-end.x,point.z-end.z) < .1;
    if (column.arrived) { column.legIndex = route.length - 1; column.legT = 0; }
    column.tailAdvanceM = 0; column.scattered = false; column.regoalAt = -Infinity;
    for (const member of column.Alive) {
      if (member.p012Injured) continue;
      const along = Math.max(0, projection.along - member.slot.back);
      const at = P012RoutePoint(route, along), ahead = P012RoutePoint(route, along + .1);
      const length = Math.hypot(ahead.x-at.x,ahead.z-at.z) || 1;
      member.routeLeg = P012RouteProjection(route, at).index; member.routeFloorDistance = 0;
      this.host.MoveActor(member.handle, { x:at.x-(ahead.z-at.z)/length*member.slot.lateral,
        z:at.z+(ahead.x-at.x)/length*member.slot.lateral });
    }
    column._UpdateLitters();
  }
  Flight(preset) {
    const { strafe } = this.host.Get();
    this.Settle();
    if (!strafe.run || strafe.run.presetId !== preset) return;
    // Run the existing authored phase and victim callbacks exactly once. Avoid
    // firing a second combat simulation while the pause menu is open.
    for (const phase of ["enter","fire"]) if(!strafe.run.beats.some(beat=>beat.name===phase)) strafe.Beat(phase);
    strafe.run.t = strafe.run.fireToS;
    strafe.StepVictims(); if(!strafe.run.beats.some(beat=>beat.name==="exit")) strafe.Beat("exit"); strafe.Abort("debugNextProgress");
    this.Settle();
  }
  Opening(beat) {
    const { runtime, stageZero, flow } = this.host.Get(), a = flow.config.activities;
    runtime.StepOpeningCast(0);
    if (beat === 0) {
      stageZero.RestoreArrival({version:2,phase:"complete",elapsed:60,skipped:true});
      this.Signal("P012Arrival", "P012TrainDoor");
      this.host.MoveActor(runtime.host.GuideActor(), a.trainRoute.at(-1));
      this.host.MovePlayer(a.weaponReceivePosition);
      return;
    }
    if (beat === 1) {
      if (!flow.facts.has("weapon")) this.Action("p012_weaponCheck");
      if (!flow.facts.has("issuedAmmo")) this.Action("p012_ammoIssue");
      for (const entry of runtime.trainColumn.entries) {
        if (entry.retired) continue;
        runtime.host.SetOpeningEquipment(entry.actor, "ammo");
        entry.weaponIssueCount = Math.max(1,entry.weaponIssueCount); entry.ammoIssueCount = Math.max(1,entry.ammoIssueCount);
        Object.assign(entry,{weaponIssued:true,ammoIssued:true,exitDone:true,hold:0,index:entry.steps.length,
          stage:"arrived",released:entry.original});
        this.host.MoveActor(entry.actor,entry.steps.at(-1).point);
      }
      runtime.trainColumn.merges.clear(); runtime.StepOpeningCast(0);
      this.Signal("P012MusterCalled","P012BriefingStarted"); this.Dialogue();
      this.host.MoveActor(runtime.host.GuideActor(),a.briefing.position);
      this.host.MovePlayer(a.villageRoute[0]);
    }
    if (beat === 2 || beat === 3) {
      const end=a.villageRoute.at(-1);
      this.host.MoveActor(runtime.host.GuideActor(),end);
      for (const [index,entry] of (runtime.openingCast || []).entries())
        this.host.MoveActor(entry.actor,P012RoutePoint(runtime.march.route,
          Math.max(0,P012RouteProjection(runtime.march.route,end).along-2-index*1.2)));
      this.host.MovePlayer({x:end.x+1,z:end.z+1});
      this.Signal(beat===2?"P012VillageRoad":"P012VillageNorthDeparture");
    }
    if (beat === 4) {
      stageZero.shellShot.Finish(); stageZero.shellShot.played = true;
      stageZero.shellShot.point ||= {...a.approachShells[0].point};
      runtime.guideReactionUntil = 0;
      this.Mark("northApproachChat","northNearMissRequested","northNearMissImpact","northCovered");
      this.Signal("P012NorthApproachChat","P012NorthNearMissIncoming","P012NorthNearMissImpact",
        "P012Shelling","P012NorthDitchEntered","P012NorthSquadRegrouped","P012NorthContinue");
      runtime.marchFrontlineReached = true;
      for (const [index,entry] of (runtime.openingCast || []).entries()) {
        Object.assign(entry,{marchComplete:true,marchDefensePoint:a.openingMarchDefensePositions[index],
          stage:"frontline",shellReacted:true,shellReactionUntil:0,shellStanceRestored:true});
        this.host.MoveActor(entry.actor,entry.marchDefensePoint);
        entry.actor.scriptedNoncombatant=false;runtime.DefendMarchEntry(entry);
      }
      this.host.MoveActor(runtime.host.GuideActor(),a.shellCoverRoute.at(-1));
      this.host.MovePlayer(flow.config.anchors.ammoPickup);
    }
  }
  Next() {
    if (!this.State()?.enabled) return false;
    this.busy = true;
    try {
      const g=this.host.Get(), {flow,runtime,carry,setpieces}=g, a=flow.config.activities, mem=setpieces.mem;
      const beat=flow.beat;
      this.host.Prepare();
      if (beat <= 4) this.Opening(beat);
      if (beat === 5) {
        if (carry.KindId !== "ammoCrate") { carry.ForceRelease("debugNextProgress"); this.Action("p012_ammoPickup"); }
        this.Action("p012_ammoDrop"); this.host.MovePlayer(flow.config.anchors.gunports[1]);
      }
      if (beat >= 6 && beat <= 10) {
        for (let i=0;i<=beat-6;i++) this.Wave(i,true);
        if(beat===10)this.host.MovePlayer(a.woundedDragFrom);
      }
      if (beat === 11) {
        if(!flow.supplyReceipts.has("wounded"))this.Action("p012_woundedCheck");
        Object.assign(mem.p012WoundedDrag,{delivered:true,position:{...a.woundedDragTo},last:null});
        setpieces.host.MoveProp(mem.p012WoundedDrag.prop,{...a.woundedDragTo,y:.15});
        carry.ForceRelease("delivered"); this.Signal("P012WoundedDragDelivered");
        this.host.MoveActor(runtime.host.GuideActor(),a.woundedDragTo);
        runtime.guide=null;
        this.host.MovePlayer({x:a.woundedDragTo.x+1,z:a.woundedDragTo.z+1});
      }
      if (beat === 12) {
        this.Action("p012_volunteer"); this.Dialogue(); this.Signal("EscortCall"); this.Settle();
        this.host.MovePlayer(mem.column.HeadPosition());
      }
      if (beat === 13) {
        this.Wave(5,true);this.Mark("roadContactSeen","roadContactHeld","roadContactClear","roadContactReleased");
        this.Signal("P012RoadContactSeen","P012RoadContactHold","P012RoadContactClear","P012RoadContactRelease");
        this.Settle();this.Column(a.evacStagingPosition);this.host.MovePlayer(a.evacStagingPosition);
        this.host.MoveActor(runtime.host.GuideActor(),a.ambushEntryRoute[0]);
      }
      if (beat === 14) {this.Wave(6,true);this.Signal("P012RoadGunSilenced");}
      if (beat === 15) {
        this.Mark("roadWounded","regroup");this.Signal("P012RoadWoundedChecked");
        this.host.MoveActor(runtime.host.GuideActor(),a.airObservationPosition);
        this.host.MovePlayer(a.airObservationPosition);
      }
      if (beat === 16) {
        flow.airRouteChoice ||= "ditch";this.Mark("airRouteChosen");this.Signal("P012AirRouteChosen");
        this.Flight("railPass");this.Column(a.airColumnReadyPosition);
        this.host.MovePlayer(a.airColumnReadyPosition);flow.SaveCheckpoint("CP04");this.Signal("P012AirReady");
      }
      if (beat === 17) {
        this.Flight("crowdTurn");carry.ForceRelease("debugNextProgress");
        if(!flow.facts.has("airObstacleResolved"))this.Action("p012_airCartClear");
        this.Dialogue();this.host.MovePlayer(mem.column.HeadPosition());
      }
      if (beat === 18) {
        if(carry.KindId!=="stretcher"){carry.ForceRelease("debugNextProgress");this.Dialogue();this.Action("ch1_stretcher");}
        this.host.MovePlayer(a.stretcherCarryTo);
        this.host.MoveActor(mem.p012CarriedLitter.front.handle,{x:a.stretcherCarryTo.x,z:a.stretcherCarryTo.z-2.4});
        this.host.MoveActor(runtime.host.GuideActor(),a.stretcherGuideRoute.at(-1));
        if(runtime.guide){runtime.guide.index=runtime.guide.route.length-1;runtime.guide.approach=[];}
        this.Signal("P012CarryReady");this.Settle();
      }
      if (beat === 19) {
        this.Flight("divePress");this.Settle();
        const litter=mem.p012CarriedLitter,at=mem.p012FallenAt;
        if(litter&&at){
          this.host.MoveActor(litter.front.handle,{x:at.x,z:at.z-(a.stretcherCarryPose.bearerSpanM/2)});
          this.host.MoveActor(litter.rear.handle,{x:at.x,z:at.z+(a.stretcherCarryPose.bearerSpanM/2)});
          this.Settle();
        }
        this.host.MovePlayer(a.closeFightRoute[0]);
      }
      if (beat === 20) {this.Wave(7,true);this.host.MovePlayer(a.southRoomRoute[0]);}
      if (beat === 21) {this.Wave(8,true);this.host.MovePlayer(a.southAssemblyPosition);}
      if (beat === 22) {
        this.Signal("P012BlockadeDecision");
        this.host.MoveActor(runtime.host.GuideActor(),a.retreatSmokeUse);
        this.host.MovePlayer(a.retreatSmokeUse);
      }
      if (beat === 23) {
        if(!flow.facts.has("retreatSmokeDeployed"))this.Action("p012_retreatSmoke");
        this.Column(a.regripPosition);this.Signal("P012LastLitterArrived","P012HubRevisited");
        this.host.MovePlayer(mem.p012CarriedLitter?.rear?.handle?.position || a.regripPosition);
        this.host.MoveActor(runtime.host.GuideActor(),flow.config.anchors.shelter);
      }
      if (beat === 24) {
        this.Dialogue();if(carry.KindId!=="stretcher")this.Action("ch1_regrip");
        this.host.MovePlayer(flow.config.anchors.shelter);this.Settle();
      }
      this.Dialogue();
      flow.completionReasons[beat]="debugNextProgress";
      flow.Enter(beat+1);this.Settle();
      if(beat===14){this.Column(a.roadWoundedPosition);this.host.MovePlayer(a.roadWoundedPosition);}
      if(beat===21)this.Column(a.southAssemblyPosition);
      const squadPoint=({12:a.roadContactGuideRoute[0],13:a.evacStagingPosition,14:a.airRegroupRoute[0],
        15:a.airObservationPosition,17:a.stretcherGuideRoute.at(-1),20:a.southRoomRoute[0],
        21:a.southAssemblyPosition,23:a.regripPosition})[beat];
      if(squadPoint)this.Squad(squadPoint);
      flow.last=null;flow.lastSample=this.host.Sample();flow.StartGuide();runtime.Update(0);
      // Open the new encounter immediately, without consuming its completion.
      const wave=P012_WAVES.findIndex(w=>w.beat===flow.beat);
      if(wave>=0)this.Wave(wave);
      if(flow.beat===19)this.Wave(P012_WAVES.findIndex(w=>w.kind==="closeFight"));
      if(flow.beat===20){flow.closePressureReleased=true;flow.closeReleasedGroup=0;}
      flow.lastSample=this.host.Sample();
      flow.action=flow.CurrentObjective().text;flow.host.Objective(flow.action);
      this.host.Finish(flow.beat===25);
      return {from:P012_BEATS[beat].id,to:P012_BEATS[flow.beat].id};
    } finally { this.busy=false; }
  }
}
