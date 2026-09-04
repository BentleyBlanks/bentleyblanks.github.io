// P012 physical actors and pressure adapters. Pure rules; geometry/audio remain host-owned.
function TrafficPoint(path, distance) {
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(distance<=length)return {x:a.x+(b.x-a.x)*distance/length,z:a.z+(b.z-a.z)*distance/length};
    distance-=length;
  }
  return {...path[path.length-1]};
}
function TrafficLength(path){return path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.z-path[i].z),0);}
export class FirstLevelP012Runtime {
  constructor(host, config) {
    this.host = host; this.config = config; this.guide = null; this.near = []; this.far = [];
    this.weaponActionCount = 0; this.mortarImpactCount = 0; this.mortarImpactPosition = null;
    this.pendingShells = []; this.time = 0; this.traffic = [];
    if(config.anchors?.trainSpawn)this.SaveSafePoint("Start",config.anchors.trainSpawn,"stand",0);
  }
  Guide(spec) {
    if (spec.beat === 8 && this.beat !== 8) { this.mgSuppressedAt = null; this.friendlyMgResponse = false; }
    this.beat = spec.beat;
    // Finish the casualty route physically before holding the volunteer rendezvous.
    if (spec.beat === 12 && this.guide?.beat === 11 && this.guide.route.length) {
      this.guide = { ...this.guide, beat: 12, WaitAt: (index) => index === this.guide.route.length - 1 };
      return;
    }
    const route = spec.route || [], position = this.host.Position(this.host.GuideActor());
    if (!route.length) this.host.ReleaseGuide?.(this.host.GuideActor());
    let index = 0;
    if (position && route.length) {
      for (let i = 1; i < route.length; i++) if (Math.hypot(position.x - route[i].x, position.z - route[i].z) < Math.hypot(position.x - route[index].x, position.z - route[index].z)) index = i;
      if (index < route.length - 1) index++;
    }
    if (Number.isInteger(spec.startIndex)) index = Math.max(0, Math.min(route.length - 1, spec.startIndex));
    this.guide = { ...spec, route, index };
    if (!this.config.activities?.traffic && spec.beat === 2 && !this.traffic.length) {
      const routes = [route.map((point) => ({ x: point.x - 2, z: point.z })),
        [...route].reverse().map((point) => ({ x: point.x + 2, z: point.z }))];
      for (const [side, path] of routes.entries()) for (let slot = 0; slot < 3; slot++) {
        const start=TrafficPoint(path,slot*2.8),endDistance=TrafficLength(path)-(2-slot)*2.8;
        const actor = this.host.TrafficActor?.(side, slot, start);
        if (actor) {
          actor.scriptedNoncombatant = true;
          const parking=TrafficPoint(path,endDistance);
          const stagedPath=[start,...path.slice(1,-1),parking];
          this.traffic.push({ actor, path:stagedPath, index:0,side,slot,parking,arrived:false });
        }
      }
    }
  }
  SaveSafePoint(id, position, stance = "stand", yaw = 0) {
    const fixed={CP03:{x:30,z:10},CP05:{x:44,z:62,stance:"prone"},CP06:{x:42,z:94,stance:"prone"}}[id];
    this.safePoint={id,x:position.x,z:position.z,stance,yaw,...fixed};
  }
  RetryPlayer() {
    if(!this.failed || !this.safePoint)return false;
    if(this.host.RestorePlayer?.({...this.retryAtLoad || this.safePoint})===false)return false;
    this.failed=false;return true;
  }
  SpawnEnemy(spec) { const actor = this.host.SpawnEnemy(spec); if (actor) this.near.push(actor); return actor; }
  RecordDodgeIntent(position, view = null, carryKind = null) {
    this.dodgeIntent = { position: { x: position.x, z: position.z }, at: this.time };
    if (view?.player?.open && carryKind === "stretcher") this.host.ReleaseForDodge?.();
  }
  RecordGrenade(position) { this.grenadeThrows = (this.grenadeThrows || 0) + 1; this.lastGrenadePosition = { x: position.x, z: position.z }; }
  RecordAircraftShot(origin, aim, view) {
    if (this.beat !== 16 && this.beat !== 17) return false;
    const air = view?.active && view.aircraft;
    if (!air || this.host.Signalled("P012AircraftPlayerFire")) return false;
    const dx=air.x-origin.x,dy=air.y-origin.y,dz=air.z-origin.z;
    const length=Math.hypot(dx,dy,dz)*Math.hypot(aim.x,aim.y,aim.z);
    if (!(length>0) || (dx*aim.x+dy*aim.y+dz*aim.z)/length < Math.cos(5*Math.PI/180)) return false;
    if (!this.host.VisibleAircraft?.(origin,air)) return false;
    this.host.Signal?.("P012AircraftPlayerFire");return true;
  }
  DeployRetreatSmoke(point) {
    if (this.smoke) return false;
    const handle = this.host.DeploySmoke?.(point);
    if (!handle) return false;
    this.smoke = { ...point, handle, until: this.time + 125 }; return true;
  }
  StepRetreatPursuit() {
    if (!this.smoke || this.beat !== 23) return;
    if (!this.pursuit) this.pursuit = (this.config.activities?.retreatPursuitRoutes || []).map((route,index)=>({actor:this.far[index],route,index:0,startedAt:this.host.CombatTime?.() ?? this.time}));
    for (const entry of this.pursuit) {
      if (!entry.actor || !this.host.Alive(entry.actor) || !entry.route.length) continue;
      const position=this.host.Position(entry.actor),point=entry.route[entry.index];
      if (position && Math.hypot(position.x-point.x,position.z-point.z)<=.6 && entry.index<entry.route.length-1) entry.index++;
      this.host.PursuitGoal?.(entry.actor,entry.route[entry.index]);
      if (!this.pursuitThreat && entry.index>1 && entry.actor.lastFire>entry.startedAt && this.host.Firing(entry.actor) && this.host.ThreatensEscort?.(entry.actor)) { this.pursuitThreat=true;this.host.Signal?.("P012RetreatRightThreat"); }
    }
  }
  BlocksSight(from, to) {
    if (!this.smoke || this.time >= this.smoke.until) return false;
    const dx = to.x - from.x, dz = to.z - from.z, lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((this.smoke.x - from.x) * dx + (this.smoke.z - from.z) * dz) / (lengthSquared || 1)));
    const y = from.y + (to.y - from.y) * t;
    return y < 3.5 && y > -0.5 && Math.hypot(from.x + dx * t - this.smoke.x, from.z + dz * t - this.smoke.z) < 7.5;
  }
  TryDitchDodge(position, stance, view) {
    const intent = this.dodgeIntent;
    if (!intent || this.time - intent.at > 3 || !view?.player?.open || stance === "stand") return false;
    const moved = Math.hypot(position.x - intent.position.x, position.z - intent.position.z);
    const inDitch = (this.config.anchors?.strafeSlots || []).some((point) => Math.hypot(position.x - point.x, position.z - point.z) < 3);
    if (moved < 0.8 || !inDitch) return false;
    this.dodgeIntent = null; return !!this.host.Dodge?.("p012DitchMovement");
  }
  DiveSpeed(view) {
    return this.beat === 19 && this.dodgeIntent && this.time - this.dodgeIntent.at <= 3 && view?.player?.open ? 1.2 : undefined;
  }
  Shelling(point, damaging = false) {
    if (!point) return;
    const shell = { point: { ...point }, due: damaging ? Infinity : this.time + 1.6, damaging, done: false };
    shell.point = this.host.WarnShell(point, damaging, (at) => this.RecordShellImpact(shell, at));
    this.pendingShells.push(shell);
    if (damaging) this.mortarWarningPosition = { ...shell.point };
  }
  RecordShellImpact(shell, point) {
    if (shell.done) return;
    shell.done = true; this.mortarImpactPosition = { x: point.x, z: point.z }; this.mortarImpactCount++;
  }
  Update(dt) {
    // One finite pool, present from the opening; never recycle people by teleport.
    if (!this.trafficInitialized && this.config.activities?.traffic) {
      this.trafficInitialized=true;
      for(const entry of this.config.activities.traffic){
        const actor=this.host.TrafficActor?.(entry.side,entry.slot,entry.route[0],entry);
        if(!actor)continue;
        actor.scriptedNoncombatant=true;
        this.traffic.push({...entry,actor,path:entry.route,index:0,parking:entry.route.at(-1),arrived:false,travelM:0,lastPosition:{...entry.route[0]}});
      }
    }
    this.time += dt;
    if (this.smoke && this.time >= this.smoke.until && !this.smoke.cleared) { this.host.ClearSmoke?.(this.smoke.handle); this.smoke.cleared = true; }
    if (this.beat === 8) {
      if (this.mgSuppressedAt == null && this.host.EnemyMgSuppressed?.()) this.mgSuppressedAt = this.host.CombatTime?.() ?? this.time;
      if (this.mgSuppressedAt != null && this.host.FriendlyMgFired?.(this.mgSuppressedAt)) this.friendlyMgResponse = true;
    }
    const escortDefense = this.beat === 14 || (this.beat >= 20 && this.beat <= 22);
    const defensive = (this.beat >= 6 && this.beat <= 10) || escortDefense;
    if (defensive && !this.defenders) {
      const ports = this.config.anchors?.gunports || [];
      this.defenders = this.host.FriendlyActors?.() || [];
      for (const [index, actor] of this.defenders.entries()) {
        if (escortDefense) {
          const point = this.host.Position(actor);
          if (point) this.host.Defend?.(actor, point, { ...this.config.activities?.frontlineDoctrine, holdRadiusM: 2 });
          continue;
        }
        const port = ports[index % ports.length];
        if (port) this.host.Defend?.(actor, { x: port.x + (index % 2 ? 2 : -2), z: port.z + 2 + Math.floor(index / ports.length) * 2 }, this.config.activities?.frontlineDoctrine);
      }
    } else if (!defensive && this.defenders) {
      for (const actor of this.defenders) this.host.ReleaseDefense?.(actor);
      this.defenders = null;
    }
    if (this.beat === 23 && !this.retreatDisciplineDone) {
      this.retreatGuards ||= this.host.FriendlyActors?.() || [];
      const route=this.config.returnWaypoints || [], at=this.host.RetreatPosition?.();
      let total=0,progress=0,best=Infinity;
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        if(at){const t=Math.max(0,Math.min(1,((at.x-a.x)*dx+(at.z-a.z)*dz)/(len*len||1))),miss=Math.hypot(at.x-a.x-t*dx,at.z-a.z-t*dz);
          if(miss<best){best=miss;progress=total+t*len;}}
        total+=len;
      }
      this.retreatDisciplineDone=total>0 && progress>=total/2;
      for(const actor of this.retreatGuards)this.host.FireDiscipline?.(actor,this.retreatDisciplineDone?null:this.config.activities?.frontlineDoctrine);
    } else if (this.beat !== 23 && this.retreatGuards) {
      for(const actor of this.retreatGuards)this.host.FireDiscipline?.(actor,null);
      this.retreatGuards=null;
    }
    for (const shell of this.pendingShells.filter((item) => !item.done && item.due <= this.time)) {
      this.host.ImpactShell(shell.point); this.RecordShellImpact(shell, shell.point);
    }
    const guide = this.guide, actor = this.host.GuideActor();
    if (guide && actor && guide.route.length) {
      const point = guide.route[guide.index]; const position = this.host.Position(actor);
      const nearPoint=position && Math.hypot(position.x-point.x,position.z-point.z)<(guide.beat===0||guide.beat===1?1.3:2);
      const waiting=nearPoint && !!guide.WaitAt?.(guide.index);
      if (nearPoint && guide.index < guide.route.length - 1 && !waiting) guide.index++;
      if (guide.beat === 5 && guide.index === guide.route.length - 1 && position && Math.hypot(position.x - point.x, position.z - point.z) < 2) guide.clearGunport = true;
      const target = guide.clearGunport ? { x: guide.route.at(-1).x - 5, z: guide.route.at(-1).z + 2 } : guide.route[guide.index];
      this.host.Move(actor, waiting ? position : target, waiting ? 0 : guide.speed);
      if(waiting && guide.FaceAt) {
        const facing=guide.FaceAt(guide.index);
        if(facing && Math.hypot(facing.x-position.x,facing.z-position.z)>.05){
          const current=this.host.GuideYaw?.(actor) ?? 0;
          const wanted=Math.atan2(-(facing.x-position.x),-(facing.z-position.z));
          const delta=Math.atan2(Math.sin(wanted-current),Math.cos(wanted-current));
          const turn=Math.max(-3.4*dt,Math.min(3.4*dt,delta));
          this.host.FaceGuide?.(actor,current+turn);
        }
      }
    }
    if (this.host.Signalled("P012SouthVerified") && this.far.length < 4) {
      const index = this.far.length;
      const point = this.config.anchors?.blockadePositions?.[index] || { x: 35 + index * 4, z: 113 };
      const actor = this.host.SpawnEnemy({ ...point, weapon: "Type38", p012Far: true, squadId: "P012Blockade" });
      if (actor) this.far.push(actor);
    }
    this.StepRetreatPursuit();
    for (const walker of this.traffic) {
      if(walker.retired)continue;
      if(walker.arrived&&walker.side===0&&this.guide?.beat>2){walker.retired=true;walker.actor.scriptedNoncombatant=false;this.host.ReleaseGuide?.(walker.actor);continue;}
      const point = walker.path[walker.index], position = this.host.Position(walker.actor);
      if (!position) continue;
      if(walker.lastPosition){walker.travelM+=Math.hypot(position.x-walker.lastPosition.x,position.z-walker.lastPosition.z);walker.lastPosition={x:position.x,z:position.z};}
      const gate=walker.proximityRelease;
      if(gate&&!walker.proximityReleased&&walker.index===gate.index&&Math.hypot(position.x-point.x,position.z-point.z)<2){
        const observer=this.host.PlayerPosition?.();
        if((this.beat??0)>=gate.beat&&observer&&Math.hypot(observer.x-point.x,observer.z-point.z)<gate.radius)walker.proximityReleased=true;
        else {this.host.Move(walker.actor,position,0);continue;}
      }
      if((this.beat??0)<(walker.releaseBeat??0)
        || (walker.pauseIndex===walker.index&&!this.host.Signalled("P012TrainDoor")&&Math.hypot(position.x-point.x,position.z-point.z)<2)){
        this.host.Move(walker.actor,position,0);continue;
      }
      const leader=this.traffic.find(other=>other.side===walker.side&&other.slot===walker.slot+1);
      const ahead=leader&&this.host.Position(leader.actor);
      if(ahead&&Math.hypot(position.x-ahead.x,position.z-ahead.z)<2.2){this.host.Move(walker.actor,position,0);continue;}
      if (position && Math.hypot(position.x - point.x, position.z - point.z) < 2 && walker.index < walker.path.length - 1) walker.index++;
      // AI Act stops moving at 1.2 m; arrival needs a small tolerance beyond that radius.
      walker.arrived=walker.index===walker.path.length-1&&Math.hypot(position.x-walker.parking.x,position.z-walker.parking.z)<1.3;
      const destination=walker.path[walker.index], distance=Math.hypot(destination.x-position.x,destination.z-position.z);
      // These lanes have swept-clear segments. Keep the AI's immediate goal
      // local so its coarse long-distance nav grid cannot send a passer-by
      // around the station shed instead of along the visible lane.
      const localTarget=distance>10?{x:position.x+(destination.x-position.x)*8/distance,z:position.z+(destination.z-position.z)*8/distance}:destination;
      this.host.Move(walker.actor, walker.arrived?position:localTarget, walker.arrived?0:1.2);
    }
    const observer=this.host.PlayerPosition?.();
    if(observer)for(const north of this.traffic.filter(w=>w.side===0))for(const south of this.traffic.filter(w=>w.side===1)){
      const a=this.host.Position(north.actor),b=this.host.Position(south.actor);
      if(a&&b&&a.z<=b.z&&north.travelM>2&&south.travelM>2&&Math.hypot(a.x-b.x,a.z-b.z)<10
        &&Math.hypot(observer.x-a.x,observer.z-a.z)<18&&Math.hypot(observer.x-b.x,observer.z-b.z)<18)this.trafficPassedNearPlayer=true;
    }
  }
  Sample() {
    return {
      // Host evaluates the real rendering camera and current scene raycast.
      // Missing visibility evidence fails closed; yaw alone is not observation.
      orientationVisible: this.beat === 3 ? (this.config.activities?.orientations || []).map(observation =>
        !!observation.visibleTarget && this.host.ObservationVisible?.(observation.visibleTarget) === true) : [],
      friendlyMgFiredAfterSuppression: !!this.friendlyMgResponse,
      enemyMgDestroyed: this.near.some((actor) => actor.weaponId === "Type11" && !this.host.Alive(actor)),
      grenadeThrows: this.grenadeThrows || 0, lastGrenadePosition: this.lastGrenadePosition || null,
      retreatSmokeActive: !!this.smoke && this.time < this.smoke.until,
      retreatPursuit: (this.pursuit || []).map(entry=>({index:entry.index,alive:!!this.host.Alive(entry.actor),position:this.host.Position(entry.actor),target:entry.route[entry.index]})),
      weaponActionCount: this.weaponActionCount,
      guidePosition: this.host.Position(this.host.GuideActor()), guideRouteIndex: this.guide?.index || 0,
      guideAlive: !!this.host.GuideActor() && !!this.host.Alive(this.host.GuideActor()),
      guideHealth: this.host.GuideActor()?.health ?? null, guideOrder: this.host.GuideActor()?.order ?? null,
      trafficReady: this.config.activities?.traffic ? !!this.trafficPassedNearPlayer : this.traffic.length === 6 && this.traffic.every((walker) => walker.index > 0),
      traffic: this.traffic.map((walker) => ({ side: walker.side, slot:walker.slot, role:walker.role, travelM:walker.travelM||0,
        index: walker.index, arrived:walker.arrived,parking:walker.parking,position: this.host.Position(walker.actor) })),
      nearEnemyDeaths: this.near.filter((actor) => !this.host.Alive(actor)).length,
      blockadeVisible: this.far.some((actor) => this.host.Alive(actor) && this.host.Visible?.(actor)),
      blockadePressure: this.far.some((actor) => this.host.Firing(actor)),
      blockadeDestroyed: this.far.length === 4 && this.far.every((actor) => !this.host.Alive(actor)),
      farSpawned: this.far.length, farDeaths: this.far.filter((actor) => !this.host.Alive(actor)).length,
      mortarImpactPosition: this.mortarImpactPosition, mortarImpactCount: this.mortarImpactCount,
      mortarWarningPosition: this.mortarWarningPosition || null,
      mortarWarningActive: this.pendingShells.some((shell) => shell.damaging && !shell.done),
      regripPosition: this.config.activities?.regripPosition,
    };
  }
}
