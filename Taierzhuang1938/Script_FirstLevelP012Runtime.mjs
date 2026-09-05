// P012 physical actors and pressure adapters. Pure rules; geometry/audio remain host-owned.
import { P012SouthPoint } from "./Data_FirstLevelP012Space.mjs";
import { FirstLevelP012March, P012SegmentClear, P012NextVisiblePoint, P012RouteProjection, P012RoutePoint } from "./Script_FirstLevelP012March.mjs";
import { FirstLevelP012TrainColumn } from "./Script_FirstLevelP012TrainColumn.mjs";
function TrafficPoint(path, distance) {
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(distance<=length)return {x:a.x+(b.x-a.x)*distance/length,z:a.z+(b.z-a.z)*distance/length};
    distance-=length;
  }
  return {...path[path.length-1]};
}
function TrafficLength(path){return path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.z-path[i].z),0);}
/** Local guide reconnect: only known corridor vertices and body-clear edges; never teleport. */
export function P012GuideApproach(blocks, start, target, points = [], radius = .42) {
  if (!start || !target || !Number.isFinite(radius) || radius<=0) return null;
  const nodes=[start,target,...points.filter(Boolean)], costs=nodes.map(()=>Infinity), previous=[], visited=new Set();
  costs[0]=0;
  while(visited.size<nodes.length){
    let at=-1;
    for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(at<0||costs[i]<costs[at]))at=i;
    if(at<0||!Number.isFinite(costs[at]))return null;
    if(at===1){const route=[];for(let index=1;index!==0;index=previous[index])route.unshift({...nodes[index]});return route;}
    visited.add(at);
    for(let i=1;i<nodes.length;i++)if(!visited.has(i)&&P012SegmentClear(blocks,nodes[at],nodes[i],radius)){
      const cost=costs[at]+Math.hypot(nodes[i].x-nodes[at].x,nodes[i].z-nodes[at].z);
      if(cost<costs[i]){costs[i]=cost;previous[i]=at;}
    }
  }
  return null;
}
export class FirstLevelP012Runtime {
  constructor(host, config) {
    this.host = host; this.config = config; this.guide = null; this.near = []; this.far = [];
    this.weaponActionCount = 0; this.mortarImpactCount = 0; this.mortarImpactPosition = null;
    this.pendingShells = []; this.time = 0; this.traffic = [];
    if(config.activities?.openingMarch)this.march=new FirstLevelP012March(config.layout.blocks,config.activities.openingMarchRoute||config.activities.villageRoute);
    if(config.anchors?.trainSpawn)this.SaveSafePoint("Start",config.anchors.trainSpawn,"stand",0);
  }
  Guide(spec) {
    if(Number.isFinite(spec.arrivalRadius)) {
      const actor=this.host.GuideActor();if(actor)actor.scriptArrivalRadius=Math.max(.05,spec.arrivalRadius*.5);
    }
    if(this.guide?.heldStance!==undefined){const actor=this.host.GuideActor();if(actor)this.ApplyGuideStance(actor,this.guide.heldStance);}
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
    if(spec.safeRoute && route.length){
      // This actor's local guide task owns movement until handoff. Leaving the
      // defence flag set lets Ai.Act replace the commanded goal with standstill.
      const actor=this.host.GuideActor();
      if(actor?.scriptDefensive)this.host.ReleaseDefense?.(actor);
      if(this.defenders)this.defenders=this.defenders.filter(defender=>defender!==actor);
      this.guide.bodyRadius=this.GuideBodyRadius(actor);
      this.guide.approach=P012GuideApproach(this.config.layout?.blocks||[],position,route[0],spec.approachPoints,this.guide.bodyRadius);
      this.guide.approachIndex=0;
      this.guide.travelStart=position&&{x:position.x,z:position.z};
    }
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
    const activity = this.config.activities || {};
    const fixed={CP03:activity.evacStagingPosition || P012SouthPoint(30,10),
      CP05:{...(activity.closeFightRoute?.[0] || P012SouthPoint(44,62)),stance:"prone"},
      CP06:{...(activity.southGrenadeSupply || P012SouthPoint(42,94)),stance:"prone"}}[id];
    this.safePoint={id,x:position.x,z:position.z,stance,yaw,...fixed};
  }
  RetryPlayer() {
    if(!this.failed || !this.safePoint)return false;
    if(this.host.RestorePlayer?.({...this.retryAtLoad || this.safePoint})===false)return false;
    this.failed=false;return true;
  }
  SpawnEnemy(spec) { const actor = this.host.SpawnEnemy(spec); if (actor) { actor.p012RoadContact=spec.p012RoadContact===true; this.near.push(actor); } return actor; }
  StepRoadCover() {
    const activity=this.config.activities;
    if(!activity?.roadContactFriendlyApproach)return;
    if(this.beat!==13||!this.host.Signalled?.("P012RoadContactHold")){
      for(const entry of this.roadCoverMoves||[])if(!entry.arrived)this.host.ReleaseGuide?.(entry.actor);
      this.roadCoverMoves=null;return;
    }
    this.roadCoverMoves ||= [];
    for(const [index,cover] of activity.roadContactFriendlyCovers.entries()){
      const actor=this.defenders?.[index],at=actor&&this.host.Position(actor);
      if(!actor||actor.alive===false||!at)continue;
      let entry=this.roadCoverMoves[index];
      if(!entry||entry.actor!==actor)entry=this.roadCoverMoves[index]={actor,arrived:false};
      if(entry.arrived)continue;
      if(Math.hypot(at.x-cover.x,at.z-cover.z)<.6){
        this.host.ReleaseGuide?.(actor);entry.arrived=true;
        this.host.Defend?.(actor,cover,{...activity.frontlineDoctrine,holdRadiusM:2});continue;
      }
      const radius=this.GuideBodyRadius(actor);
      if(!entry.path||entry.radius!==radius){
        entry.radius=radius;
        const approach=P012GuideApproach(this.config.layout?.blocks||[],at,activity.roadContactFriendlyApproach[0],
          activity.roadContactGuideRoute||[],radius);
        // Retain the authored intermediate corners. A shortest graph path
        // can graze a wall only at its exact vertex, while physical AI stops
        // just short of that point; the next visible corner must remain usable.
        entry.path=approach&&[...approach,...activity.roadContactFriendlyApproach.slice(1),cover];
      }
      const next=entry.path&&P012NextVisiblePoint(this.config.layout?.blocks||[],at,entry.path,0,radius);
      if(!next||next.blocked)continue;
      this.host.ReleaseDefense?.(actor);
      this.host.FireDiscipline?.(actor,activity.frontlineDoctrine);
      actor.scriptArrivalRadius=.15;
      this.host.Move?.(actor,next.point,activity.guideSpeedMps||3.05);
    }
  }
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
  AircraftVisible(origin,view){
    const air=view?.active&&view.aircraft;
    return !!air&&!!origin&&this.host.VisibleAircraft?.(origin,air)===true;
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
  StepOpeningIssue(entry, dt) {
    const issue=this.config.activities.openingIssue,at=this.host.Position(entry.actor);
    if(!at)return;
    const steps=entry.issueSteps;
    let step=steps[entry.issueIndex];
    if(!step){entry.stage="muster";entry.issueComplete=true;return;}
    entry.stage=step.stage;
    if(Math.hypot(at.x-step.point.x,at.z-step.point.z)<.4){
      entry.issueHold=(entry.issueHold||0)+Math.max(0,dt);
      if(entry.issueHold<(step.seconds||0)){this.host.Move(entry.actor,at,0);return;}
      if(step.equipment&&!entry[`${step.equipment}Issued`]){
        entry[`${step.equipment}Issued`]=true;this.host.SetOpeningEquipment?.(entry.actor,step.equipment);
      }
      entry.issueIndex++;entry.issueHold=0;step=steps[entry.issueIndex];
      if(!step){entry.stage="muster";entry.issueComplete=true;this.host.Move(entry.actor,at,0);return;}
    }else entry.issueHold=0;
    this.MoveOpeningQueued(entry,step.point,issue.speedMps||3.05,dt);
  }
  MoveOpeningQueued(entry,point,speed,dt) {
    const at=this.host.Position(entry.actor),dx=point.x-at.x,dz=point.z-at.z,distance=Math.hypot(dx,dz);
    if(distance<.001){this.host.Move(entry.actor,at,0);return;}
    let travel=Math.min(distance,8);
    // Test the whole proposed forward segment against the actual bodies ahead,
    // not a shared route cursor which could let followers pass a waiting man.
    for(const other of this.openingCast){
      if(other===entry||other.actor.alive===false)continue;
      const p=this.host.Position(other.actor);if(!p)continue;
      const x=p.x-at.x,z=p.z-at.z,along=(x*dx+z*dz)/distance;
      const lateral=Math.abs(x*dz-z*dx)/distance;
      if(along>0&&lateral<1.5)travel=Math.min(travel,Math.max(0,along-Math.sqrt(2.25-lateral*lateral)));
    }
    speed=Math.min(speed,travel/Math.max(dt,.001));
    this.host.Move(entry.actor,travel>.01?{x:at.x+dx/distance*travel,z:at.z+dz/distance*travel}:at,travel>.01?speed:0);
  }
  StepOpeningCast(dt = .1) {
    const activity=this.config.activities,parking=activity?.openingCastParking;
    if(activity?.trainColumn&&this.host.SpawnRecruit){
      if(!this.trainColumn){
        const originalActors=(this.host.FriendlyActors?.()||[]).filter(actor=>actor!==this.host.GuideActor()&&!this.traffic.some(entry=>entry.actor===actor)).slice(0,6);
        this.trainColumn=new FirstLevelP012TrainColumn({
          ExistingRecruits:()=>originalActors,SpawnRecruit:spec=>this.host.SpawnRecruit(spec),
          Initialize:(actor,point)=>{this.host.InitializeOpeningActor(actor,point);actor.scriptedNoncombatant=true;actor.p012Guided=true;actor.scriptArrivalRadius=.1;},
          SetEquipment:(actor,stage)=>this.host.SetOpeningEquipment(actor,stage),
          Position:actor=>this.host.Position(actor),Move:(actor,point,speed)=>this.host.Move(actor,point,speed),
          Release:actor=>{actor.scriptArrivalRadius=.3;},Visible:actor=>this.host.TrafficVisible(actor),Retire:actor=>this.host.RetireTraffic(actor),
          DoorOpen:()=>this.host.Signalled("P012TrainDoor"),
          Obstacles:()=>[this.host.PlayerPosition?.(),this.host.Position(this.host.GuideActor())].filter(Boolean),
        },activity.trainColumn);
      }
      this.trainColumn.Update(dt,this.beat||0);
      const entries=this.trainColumn.Entries().filter(entry=>entry.original);
      if(!this.openingCast)this.openingCast=entries.map((entry,slot)=>({...entry,marchSlot:slot,parking:activity.trainColumn.originalMuster[slot]}));
      for(const entry of this.openingCast){const source=entries.find(other=>other.actor===entry.actor);
        if(source){for(const key of ["weaponIssued","ammoIssued","released","index","stage"])if(key!=="stage"||!entry.marchComplete)entry[key]=source[key];entry.issueComplete=source.released;}}
      return;
    }
    if(!parking?.length)return;
    if(!this.openingCast){
      const guide=this.host.GuideActor();
      this.openingCast=(this.host.FriendlyActors?.()||[]).filter(actor=>actor!==guide&&!this.traffic.some(entry=>entry.actor===actor)).slice(0,parking.length).map((actor,slot)=>{
        // This is initial scene assembly, not a later movement or a respawn loop.
        const issue=activity.openingIssue;
        this.host.InitializeOpeningActor?.(actor,issue?.spawns?.[slot]||parking[slot]);
        const route=[parking[slot]];
        actor.scriptedNoncombatant=true;
        const entry={actor,parking:issue?.musterPoints?.[slot]||parking[slot],route,index:0,slot};
        if(issue){
          this.host.SetOpeningEquipment?.(actor,"empty");
          entry.issueIndex=0;entry.stage="exit";entry.weaponIssued=false;entry.ammoIssued=false;
          const spawn=issue.spawns[slot];
          let closest=1,best=Infinity;
          for(let i=1;i<issue.exitRoute.length;i++){
            const a=issue.exitRoute[i-1],b=issue.exitRoute[i],dx=b.x-a.x,dz=b.z-a.z;
            const t=Math.max(0,Math.min(1,((spawn.x-a.x)*dx+(spawn.z-a.z)*dz)/(dx*dx+dz*dz||1)));
            const distance=Math.hypot(spawn.x-a.x-t*dx,spawn.z-a.z-t*dz);
            if(distance<best){best=distance;closest=t<=0?i-1:i;}
          }
          entry.issueSteps=[...issue.exitRoute.slice(closest).map(point=>({point,stage:"exit"})),
            {point:issue.weaponPoint,stage:"weapon",seconds:issue.weaponSeconds,equipment:"weapon"},
            {point:issue.ammoPoint,stage:"ammo",seconds:issue.ammoSeconds,equipment:"ammo"},
            ...(issue.musterRoute||[]).map(point=>({point,stage:"muster"})),
            {point:entry.parking,stage:"muster"}];
          entry.route=[entry.parking];
        }
        return entry;
      });
    }
    for(const entry of this.openingCast){
      if(entry.released)continue;
      if(entry.issueSteps&&!entry.issueComplete){this.StepOpeningIssue(entry,dt);continue;}
      if((this.beat??0)>2&&(!entry.issueSteps||Math.hypot(this.host.Position(entry.actor).x-activity.openingCastRoute.at(-1).x,this.host.Position(entry.actor).z-activity.openingCastRoute.at(-1).z)<3)){
        entry.released=true;entry.stage="released";entry.actor.scriptedNoncombatant=false;this.host.ReleaseGuide?.(entry.actor);continue;}
      const at=this.host.Position(entry.actor);if(!at)continue;
      const point=entry.route[entry.index];
      if(Math.hypot(at.x-point.x,at.z-point.z)<1.3&&entry.index<entry.route.length-1)entry.index++;
      let target=entry.route[entry.index];
      if(this.beat>=2&&entry.index===entry.route.length-1&&Math.hypot(at.x-target.x,at.z-target.z)<1.3)entry.following=true;
      if(entry.following){
        const route=activity.openingCastRoute,player=this.host.PlayerPosition?.();
        if(player){let best=Infinity,along=0,progress=0;
          for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((player.x-a.x)*dx+(player.z-a.z)*dz)/(len*len||1))),distance=Math.hypot(player.x-a.x-t*dx,player.z-a.z-t*dz);if(distance<best){best=distance;progress=along+t*len;}along+=len;}
          const limit=this.beat>2&&entry.issueSteps?TrafficLength([entry.parking,...route]):Math.max(0,progress-6-entry.slot*3);
          entry.followDistance??=0;
          const followRoute=[entry.parking,...route];
          const current=TrafficPoint(followRoute,entry.followDistance);
          if(Math.hypot(at.x-current.x,at.z-current.z)<1.3)entry.followDistance=Math.min(limit,entry.followDistance+1);
          target=TrafficPoint(followRoute,Math.min(limit,entry.followDistance));
        }
      }
      const speed=Math.hypot(at.x-target.x,at.z-target.z)<1.25?0:2.2;
      if(entry.issueSteps)this.MoveOpeningQueued(entry,target,speed,dt);
      else this.host.Move(entry.actor,target,speed);
    }
  }
  DefendSupplyWalker(walker) {
    const supply=this.config.activities?.frontlineSupply;
    // ReleaseGuide clears guided arrival state; restore the bounded supply slot
    // before handing this same actor to normal defensive fire.
    if(supply)walker.actor.scriptArrivalRadius=supply.arrivalRadiusM;
    this.host.Defend?.(walker.actor,walker.parking,{...this.config.activities?.frontlineDoctrine,
      ...(supply?{holdRadiusM:supply.holdRadiusM}:{})});
  }
  StepMarch(dt) {
    if(!this.march)return;
    const guide=this.host.Position(this.host.GuideActor());if(!guide)return;
    const marchEnd=this.march.route.at(-1);
    if(this.beat>=5&&Math.hypot(guide.x-marchEnd.x,guide.z-marchEnd.z)<3)this.marchFrontlineReached=true;
    for(const entry of this.openingCast||[]){
      if(!entry.ammoIssued||entry.marchComplete||(!entry.issueComplete&&!entry.released))continue;
      const at=this.host.Position(entry.actor);if(!at)continue;
      if((this.beat??0)<2){this.host.Move(entry.actor,entry.parking,Math.hypot(at.x-entry.parking.x,at.z-entry.parking.z)>.5?3.05:0);continue;}
      if(this.host.Signalled?.("P012NorthNearMissImpact")&&!entry.shellReacted){
        entry.shellReacted=true;entry.shellReactionUntil=Math.max(this.guideReactionUntil||0,this.time+2.4);
        this.host.SetOpeningShelter?.(entry.actor,entry.shellReactionUntil-this.time);
      }
      if(this.time<(entry.shellReactionUntil||0)){this.host.Move(entry.actor,at,0);continue;}
      entry.actor.scriptedNoncombatant=true;entry.actor.scriptArrivalRadius=.3;
      const activity=this.config.activities,end=this.march.route.at(-1),slot=entry.marchSlot??entry.slot;
      const defense=activity.openingMarchDefensePositions?.[slot];
      if(this.beat>=5&&defense&&this.marchFrontlineReached){
        const projection=P012RouteProjection(this.march.route,at);
        const remaining=this.march.route.slice(projection.index);remaining.push(defense);
        const next=P012NextVisiblePoint(this.config.layout.blocks,at,remaining,0,.46);
        entry.marchPlan={point:next.point,speed:next.blocked?0:3.05,blocked:!!next.blocked};
        if(Math.hypot(at.x-defense.x,at.z-defense.z)<.45){
          entry.marchComplete=true;entry.stage="frontline";entry.marchDefensePoint=defense;
          entry.actor.scriptedNoncombatant=false;this.host.ReleaseGuide?.(entry.actor);this.DefendMarchEntry(entry);
          if(this.defenders&&!this.defenders.includes(entry.actor))this.defenders.push(entry.actor);
        }else this.host.Move(entry.actor,next.point,next.blocked?0:3.05);
        continue;
      }
      const plan=this.march.Plan(entry.actor.id,at,guide,entry.marchSlot??entry.slot,this.time);
      entry.marchPlan=plan;entry.stage="march";
      this.host.Move(entry.actor,plan.point,plan.speed);
    }
    if(this.beat===4&&this.host.Signalled?.("P012NorthDitchEntered")&&!this.host.Signalled?.("P012NorthSquadRegrouped")){
      const squad=(this.openingCast||[]).filter(entry=>entry.ammoIssued&&entry.actor?.alive!==false);
      const regroup=this.config.activities?.shellCoverRoute?.at(-1),range=this.config.activities?.northRegroupRangeM??10;
      const player=this.host.PlayerPosition?.();
      const membersReady=squad.map(entry=>{
        const point=this.host.Position(entry.actor);
        return !!entry.shellReacted&&this.time>=(entry.shellReactionUntil||0)&&!!point
          &&Math.hypot(point.x-guide.x,point.z-guide.z)<=range;
      });
      this.northRegroupGate={squadCount:squad.length,regroup:!!regroup,
        guideReady:!!regroup&&Math.hypot(guide.x-regroup.x,guide.z-regroup.z)<2.5,
        playerReady:!!player&&Math.hypot(player.x-guide.x,player.z-guide.z)<=range,membersReady};
      if(squad.length===6&&this.northRegroupGate.guideReady&&this.northRegroupGate.playerReady
        &&membersReady.every(Boolean))
        this.host.Signal?.("P012NorthSquadRegrouped");
    }
  }
  DefendMarchEntry(entry){
    entry.actor.scriptArrivalRadius=.3;
    this.host.Defend?.(entry.actor,entry.marchDefensePoint,{...this.config.activities.frontlineDoctrine,holdRadiusM:this.config.activities.openingMarchHoldRadiusM??.5});
  }
  FaceToward(actor,position,target,dt) {
    if(!target||Math.hypot(target.x-position.x,target.z-position.z)<.05)return;
    const current=this.host.GuideYaw?.(actor)||0,wanted=Math.atan2(-(target.x-position.x),-(target.z-position.z));
    const delta=Math.atan2(Math.sin(wanted-current),Math.cos(wanted-current));
    this.host.FaceGuide?.(actor,current+Math.max(-3.4*dt,Math.min(3.4*dt,delta)));
  }
  ApplyGuideStance(actor,stance) {
    if(this.host.SetGuideStance)this.host.SetGuideStance(actor,stance);
    else actor.stance=stance;
  }
  GuideBodyRadius(actor) {
    const radius=this.host.BodyRadius?.(actor);
    return Number.isFinite(radius)&&radius>0 ? radius : .42;
  }
  StepSafeGuide(guide,actor,dt) {
    const position=this.host.Position(actor), player=this.host.PlayerPosition?.(), blocks=this.config.layout?.blocks||[];
    if(!position)return;
    actor.scriptArrivalRadius=.3;
    const Stop=()=>this.host.Move(actor,position,0);
    const radius=this.GuideBodyRadius(actor);
    if(radius!==guide.bodyRadius){
      guide.bodyRadius=radius;
      const target=guide.approachIndex<guide.approach?.length ? guide.approach[guide.approachIndex] : guide.route[guide.index];
      guide.approach=P012GuideApproach(blocks,position,target,[...(guide.approachPoints||[]),...guide.route],radius);
      guide.approachIndex=0;
      guide.travelStart={x:position.x,z:position.z};
    }
    if(!guide.approach){Stop();return;}
    // A player across a corner can be farther from the next vertex while
    // already ahead along the route. Do not wait for that player to come back.
    const travelRoute=[guide.travelStart,...guide.approach,...guide.route].filter(Boolean);
    const playerProgress=player&&P012RouteProjection(travelRoute,player);
    const playerAhead=playerProgress?.distance<3&&playerProgress.along
      >P012RouteProjection(travelRoute,position).along+.5;
    const near=point=>Math.hypot(position.x-point.x,position.z-point.z)<.6;
    while(guide.approachIndex<guide.approach.length && near(guide.approach[guide.approachIndex]))guide.approachIndex++;
    if(guide.approachIndex<guide.approach.length){
      const target=guide.approach[guide.approachIndex];
      const lagging=player&&!playerAhead&&guide.waitDistance&&Math.hypot(player.x-position.x,player.z-position.z)>guide.waitDistance
        &&Math.hypot(player.x-target.x,player.z-target.z)>Math.hypot(position.x-target.x,position.z-target.z);
      if(!lagging&&P012SegmentClear(blocks,position,target,radius))this.host.Move(actor,target,guide.speed);else {Stop();this.FaceToward(actor,position,player,dt);}
      return;
    }
    let target=guide.route[guide.index];
    if(near(target)){
      const event=guide.beat===11&&guide.index===0?"P012GuideAtWounded":guide.beat===14?"P012GuideAtFlankEntry":guide.beat===15&&guide.index===guide.route.length-1?"P012GuideAtAirObservation":guide.beat===22&&guide.index===guide.route.length-1?"P012GuideAtBlockade":guide.beat===23?"P012GuideAtSmoke":null;
      if(event && !this.host.Signalled(event))this.host.Signal?.(event);
      const wait=guide.WaitAt?.(guide.index);
      if(wait || guide.index===guide.route.length-1){
        if(guide.holdStance!==undefined){guide.heldStance??=actor.stance??0;this.ApplyGuideStance(actor,guide.holdStance);}
        Stop();this.FaceToward(actor,position,guide.FaceAt?.(guide.index)||player,dt);return;
      }
      target=guide.route[++guide.index];
    }
    const lagging=player&&!playerAhead&&guide.waitDistance&&Math.hypot(player.x-position.x,player.z-position.z)>guide.waitDistance
      &&Math.hypot(player.x-target.x,player.z-target.z)>Math.hypot(position.x-target.x,position.z-target.z);
    if(guide.Hold?.() || lagging || !P012SegmentClear(blocks,position,target,radius)){Stop();this.FaceToward(actor,position,player,dt);return;}
    this.host.Move(actor,target,guide.speed);
  }
  StepGuideInspection(guide,actor,position,player,dt) {
    if(guide.beat!==2||!this.config.activities?.villageInspections)return false;
    this.inspectedCorners ||= new Set();
    const corner=this.config.activities.villageInspections.find(entry=>entry.index===guide.index);
    if(corner&&!this.inspectedCorners.has(corner.index)&&Math.hypot(position.x-guide.route[guide.index].x,position.z-guide.route[guide.index].z)<2){
      this.inspectedCorners.add(corner.index);this.guideInspection={index:corner.index,startedAt:this.time,endedAt:null};
      this.host.Signal?.(corner.event);
    }
    const inspection=this.guideInspection;if(!inspection||inspection.endedAt!=null)return false;
    const tail=(this.openingCast||[]).filter(entry=>entry.ammoIssued&&!entry.marchComplete)
      .map(entry=>this.host.Position(entry.actor)).filter(Boolean).sort((a,b)=>Math.hypot(b.x-position.x,b.z-position.z)-Math.hypot(a.x-position.x,a.z-position.z))[0];
    const lagging=tail&&Math.hypot(tail.x-position.x,tail.z-position.z)>15;
    const playerBehind=player&&Math.hypot(player.x-position.x,player.z-position.z)>8;
    if(this.time-inspection.startedAt>=2.2&&!lagging&&!playerBehind){inspection.endedAt=this.time;return false;}
    this.FaceToward(actor,position,lagging?tail:player,dt);return true;
  }
  StepFamilyWalker(walker,dt) {
    if(!walker.familyId||!this.config.activities?.civilianRoute||walker.arrived)return false;
    const at=this.host.Position(walker.actor),route=this.config.activities.civilianRoute,blocks=this.config.layout?.blocks||[];
    const guardian=this.traffic.find(other=>other.side===1&&other.role==="civilian"&&other.slot===walker.guardianSlot);
    if(!at||!guardian)return false;
    const lead=this.host.Position(guardian.actor),self=P012RouteProjection(route,at),leadAt=P012RouteProjection(route,lead);
    const isLeader=guardian===walker,member=walker.memberIndex||0;
    const lag=[0,.1,1.6,2.1][member]||0;
    const endDistance=P012RouteProjection(route,walker.parking).along;
    const progress=Math.min(endDistance,isLeader?self.along+2.3:Math.max(0,leadAt.along-lag));
    const center=P012RoutePoint(route,progress),radius=walker.child?.26:.46;
    const desired=P012RoutePoint(route,progress,walker.lateralM||0);
    const target=P012SegmentClear(blocks,center,desired,radius)?desired:center;
    const waypoints=[];let along=0;
    for(let index=1;index<route.length;index++){
      along+=Math.hypot(route[index].x-route[index-1].x,route[index].z-route[index-1].z);
      if(along>self.along+.1&&along<progress)waypoints.push(route[index]);
    }
    waypoints.push(target);
    let next=P012NextVisiblePoint(blocks,at,waypoints,0,radius);
    if(next.blocked&&P012SegmentClear(blocks,at,center,radius))next={point:center};
    const child=this.traffic.find(other=>other.familyId===walker.familyId&&other.child&&!other.retired);
    const childAt=child&&this.host.Position(child.actor);
    const childBehind=isLeader&&childAt&&Math.hypot(childAt.x-at.x,childAt.z-at.z)>5;
    const gap=Math.hypot(next.point.x-at.x,next.point.z-at.z);
    const speed=(walker.speedMps||1.2)*(1+.045*Math.sin(this.time*.3+walker.guardianSlot));
    walker.actualSpeedMps=childBehind?0:Math.min(speed+(isLeader?0:.35),gap*1.6);
    walker.familyTarget=next.point;walker.actor.scriptArrivalRadius=.15;
    this.host.Move(walker.actor,next.point,walker.actualSpeedMps);
    if(endDistance-self.along<.5){walker.arrived=true;this.host.Move(walker.actor,at,0);}
    return true;
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
    this.StepOpeningCast(dt);
    this.StepMarch(dt);
    this.time += dt;
    if (this.smoke && this.time >= this.smoke.until && !this.smoke.cleared) { this.host.ClearSmoke?.(this.smoke.handle); this.smoke.cleared = true; }
    if (this.beat === 8) {
      if (this.mgSuppressedAt == null && this.host.EnemyMgSuppressed?.()) this.mgSuppressedAt = this.host.CombatTime?.() ?? this.time;
      if (this.mgSuppressedAt != null && this.host.FriendlyMgFired?.(this.mgSuppressedAt)) this.friendlyMgResponse = true;
    }
    const escortDefense = (this.beat === 13 && this.host.Signalled?.("P012RoadContactHold"))
      || this.beat === 14 || (this.beat >= 20 && this.beat <= 22);
    const defensive = (this.beat >= 6 && this.beat <= 10) || escortDefense;
    if (defensive && !this.defenders) {
      const ports = this.config.anchors?.gunports || [];
      this.defenders = (this.host.FriendlyActors?.() || []).filter(actor=>!this.traffic.some(w=>w.side===0&&!w.retired&&w.actor===actor)
        &&!this.host.IsStretcherBearer?.(actor)
        &&!this.host.IsEscortMember?.(actor)
        &&!(this.guide?.safeRoute&&this.guide.route.length&&actor===this.host.GuideActor())
        &&!this.openingCast?.some(e=>this.march&&e.actor===actor&&!e.marchComplete));
      for (const [index, actor] of this.defenders.entries()) {
        if (escortDefense) {
          const slots=this.config.activities?.southDefenseSlots||[];
          const contactCover=this.beat===13&&this.host.Signalled?.("P012RoadContactHold")?this.config.activities?.roadContactFriendlyCovers?.[index]:null;
          const point = contactCover || (this.beat>=20&&slots.length ? slots[index] : null) || this.host.Position(actor);
          if (point) this.host.Defend?.(actor, point, { ...this.config.activities?.frontlineDoctrine, holdRadiusM: 2 });
          else this.host.ReleaseDefense?.(actor);
          continue;
        }
        const marched=this.openingCast?.find(e=>e.actor===actor&&e.marchComplete&&e.marchDefensePoint);
        if(marched){this.DefendMarchEntry(marched);continue;}
        const supplyWalker=this.traffic.find(w=>w.actor===actor&&w.frontlineTransfer&&w.retired);
        if(supplyWalker){this.DefendSupplyWalker(supplyWalker);continue;}
        const port = ports[index % ports.length];
        if (port) this.host.Defend?.(actor, { x: port.x + (index % 2 ? 2 : -2), z: port.z + 2 + Math.floor(index / ports.length) * 2 }, this.config.activities?.frontlineDoctrine);
      }
    }
    if(this.beat===13&&this.defenders&&this.host.Signalled?.("P012RoadContactHold")&&!this.roadContactCoversOrdered){
      this.roadContactCoversOrdered=true;
      for(const [index,cover] of (this.config.activities?.roadContactFriendlyCovers||[]).entries()){
        const actor=this.defenders[index];if(actor)this.host.Defend?.(actor,cover,{...this.config.activities?.frontlineDoctrine,holdRadiusM:2});
      }
    }
    if(this.beat!==13)this.roadContactCoversOrdered=false;
    if (!defensive && this.defenders) {
      for (const actor of this.defenders) this.host.ReleaseDefense?.(actor);
      this.defenders = null;
    }
    this.StepRoadCover();
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
    if(guide?.ReleaseWhen?.()){
      if(guide.beat===23&&!this.host.Signalled("P012GuideSmokeHandoff"))this.host.Signal?.("P012GuideSmokeHandoff");
      this.host.ReleaseGuide?.(actor);this.guide=null;
    }
    if (this.guide && guide && actor && guide.route.length) {
      if(guide.safeRoute){
        this.StepSafeGuide(guide,actor,dt);
      } else {
      const point = guide.route[guide.index]; const position = this.host.Position(actor);
      const nearPoint=position && Math.hypot(position.x-point.x,position.z-point.z)<(guide.arrivalRadius??(guide.beat===0||guide.beat===1?1.3:2));
      const reacting=this.time<(this.guideReactionUntil??0);
      const inspecting=position&&this.StepGuideInspection(guide,actor,position,this.host.PlayerPosition?.(),dt);
      const waiting=reacting || inspecting || (nearPoint && !!guide.WaitAt?.(guide.index));
      if (nearPoint && guide.index < guide.route.length - 1 && !waiting) guide.index++;
      // Incrementing the cursor is not arrival at the final gunport. Test the
      // actual destination, not the previous waypoint captured above.
      const gunport = guide.route.at(-1);
      if (guide.beat === 5 && guide.index === guide.route.length - 1 && position && Math.hypot(position.x - gunport.x, position.z - gunport.z) < 2) guide.clearGunport = true;
      const target = guide.clearGunport ? { x: guide.route.at(-1).x - 5, z: guide.route.at(-1).z + 2 } : guide.route[guide.index];
      const opening=[0,2].includes(guide.beat),player=this.host.PlayerPosition?.();
      const distance=player&&position?Math.hypot(player.x-position.x,player.z-position.z):0;
      const ahead=player&&position?(player.x-position.x)*(target.x-position.x)+(player.z-position.z)*(target.z-position.z)>0:false;
      const activity=this.config.activities || {};
      const waitForPlayer=(opening||guide.beat===13)&&!ahead&&distance>(activity.openingGuideWaitDistanceM??10);
      const speed=opening?(ahead&&distance>3?(activity.openingGuideCatchupMps??5.246):(activity.openingGuideWalkMps??3.05)):guide.speed;
      this.host.Move(actor, waiting||waitForPlayer ? position : target, waiting||waitForPlayer ? 0 : speed);
      if(waiting && guide.FaceAt && !inspecting) {
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
    }
    if (this.host.Signalled("P012SouthVerified") && this.far.length < 4) {
      const index = this.far.length;
      const point = this.config.anchors?.blockadePositions?.[index] || P012SouthPoint(35 + index * 4, 113);
      const actor = this.host.SpawnEnemy({ ...point, weapon: "Type38", p012Far: true, squadId: "P012Blockade" });
      if (actor) this.far.push(actor);
    }
    this.StepRetreatPursuit();
    for (const walker of this.traffic) {
      if(walker.retired)continue;
      const family=walker.familyId?this.traffic.filter(other=>other.familyId===walker.familyId):[walker];
      if(walker.arrived&&walker.retireWhenHidden&&family.every(other=>other.arrived&&this.host.TrafficVisible?.(other.actor)===false)
        &&this.host.RetireTraffic?.(walker.actor)===true){walker.retired=true;walker.retiredAt=this.time;continue;}
      if(walker.arrived&&walker.side===0&&(this.beat??0)>3){
        if(!walker.frontlineTransfer){
          const activity=this.config.activities||{},shell=activity.shellCoverRoute||[],ammo=activity.ammoRoute||[];
          if(shell.length&&ammo.length){
            const supply=activity.frontlineSupply,end=ammo.at(-1);
            const start=this.host.Position(walker.actor);
            const onward=supply&&start.z<shell[0].z?shell.slice(1):shell;
            walker.path=[...onward,...ammo.slice(-3,-1),...(supply?.approach||[]),supply?.positions?.[walker.slot]||{x:end.x,z:end.z+(2-walker.slot)*2.2}];
            if(supply)walker.actor.scriptArrivalRadius=supply.arrivalRadiusM;
            walker.index=0;walker.parking=walker.path.at(-1);walker.arrived=false;walker.frontlineTransfer=true;
            delete walker.pauseIndex;delete walker.proximityRelease;
          }else {this.host.Move(walker.actor,this.host.Position(walker.actor),0);continue;}
        }else{
          walker.retired=true;walker.actor.scriptedNoncombatant=false;this.host.ReleaseGuide?.(walker.actor);
          this.DefendSupplyWalker(walker);
          if(this.defenders&&!this.defenders.includes(walker.actor))this.defenders.push(walker.actor);
          continue;
        }
      }
      const point = walker.path[walker.index], position = this.host.Position(walker.actor);
      if (!position) continue;
      if(walker.lastPosition){walker.travelM+=Math.hypot(position.x-walker.lastPosition.x,position.z-walker.lastPosition.z);walker.lastPosition={x:position.x,z:position.z};}
      if(this.StepFamilyWalker(walker,dt))continue;
      const gate=walker.proximityRelease;
      if(gate&&!walker.proximityReleased&&walker.index===gate.index&&Math.hypot(position.x-point.x,position.z-point.z)<2){
        const observer=this.host.PlayerPosition?.();
        if((this.beat??0)>=gate.beat&&observer&&Math.hypot(observer.x-point.x,observer.z-point.z)<gate.radius
          &&(!gate.requireVisible||this.host.TrafficVisible?.(walker.actor)===true))walker.proximityReleased=true;
        else {this.host.Move(walker.actor,position,0);continue;}
      }
      if((this.beat??0)<(walker.releaseBeat??0)
        || (walker.pauseIndex===walker.index&&!this.host.Signalled("P012TrainDoor")&&Math.hypot(position.x-point.x,position.z-point.z)<2)){
        this.host.Move(walker.actor,position,0);continue;
      }
      const leader=this.traffic.find(other=>other.side===walker.side&&other.slot===walker.slot+1&&!other.arrived&&!other.retired);
      const ahead=leader&&this.host.Position(leader.actor);
      if(ahead&&Math.hypot(position.x-ahead.x,position.z-ahead.z)<2.2){this.host.Move(walker.actor,position,0);continue;}
      const arrival=walker.frontlineTransfer&&this.config.activities?.frontlineSupply?.arrivalRadiusM;
      if (position && Math.hypot(position.x - point.x, position.z - point.z) < (arrival ? arrival+.1 : 2) && walker.index < walker.path.length - 1) walker.index++;
      // AI Act stops moving at 1.2 m; arrival needs a small tolerance beyond that radius.
      walker.arrived=walker.index===walker.path.length-1&&Math.hypot(position.x-walker.parking.x,position.z-walker.parking.z)<(arrival ? arrival+.1 : 1.3);
      const destination=walker.path[walker.index], distance=Math.hypot(destination.x-position.x,destination.z-position.z);
      // These lanes have swept-clear segments. Keep the AI's immediate goal
      // local so its coarse long-distance nav grid cannot send a passer-by
      // around the station shed instead of along the visible lane.
      const localTarget=distance>10?{x:position.x+(destination.x-position.x)*8/distance,z:position.z+(destination.z-position.z)*8/distance}:destination;
      this.host.Move(walker.actor, walker.arrived?position:localTarget, walker.arrived?0:(walker.speedMps??1.2));
    }
    const observer=this.host.PlayerPosition?.();
    if(this.beat===2&&!this.villageRoadCued){this.villageRoadCued=true;this.host.Signal?.("P012VillageRoad");}
    if(this.beat===2&&!this.villageTrafficCued
      &&this.traffic.filter(w=>!w.retired&&w.role==="civilian"&&this.host.TrafficVisible?.(w.actor)).length>=4){
      this.villageTrafficCued=true;this.host.Signal?.("P012VillageTrafficSeen");
    }
    if(observer)for(const north of this.traffic.filter(w=>w.side===0))for(const south of this.traffic.filter(w=>w.side===1)){
      const a=this.host.Position(north.actor),b=this.host.Position(south.actor);
      if(a&&b&&a.z<=b.z&&north.travelM>2&&south.travelM>2&&Math.hypot(a.x-b.x,a.z-b.z)<10
        &&Math.hypot(observer.x-a.x,observer.z-a.z)<18&&Math.hypot(observer.x-b.x,observer.z-b.z)<18)this.trafficPassedNearPlayer=true;
    }
  }
  Sample() {
    const sampledGuide=this.host.Position(this.host.GuideActor()),sampledPlayer=this.host.PlayerPosition?.();
    const sampledRegroup=this.config.activities?.shellCoverRoute?.at(-1);
    const sampledSquad=(this.openingCast||[]).filter(entry=>entry.ammoIssued&&entry.actor?.alive!==false);
    const northRegroup=this.beat===4?{
      time:this.time,squadCount:sampledSquad.length,
      ditchEntered:!!this.host.Signalled?.("P012NorthDitchEntered"),
      gate:this.northRegroupGate||null,
      guideDistance:sampledGuide&&sampledRegroup?Math.hypot(sampledGuide.x-sampledRegroup.x,sampledGuide.z-sampledRegroup.z):null,
      playerDistance:sampledGuide&&sampledPlayer?Math.hypot(sampledPlayer.x-sampledGuide.x,sampledPlayer.z-sampledGuide.z):null,
      members:sampledSquad.map(entry=>{
        const point=this.host.Position(entry.actor);
        return {actorId:entry.actor.id,shellReacted:!!entry.shellReacted,reactionUntil:entry.shellReactionUntil||0,
          distance:point&&sampledGuide?Math.hypot(point.x-sampledGuide.x,point.z-sampledGuide.z):null};
      }),
    }:null;
    return {
      // Compatibility only; live binocular subjects are evaluated by Main.
      orientationVisible: [],
      friendlyMgFiredAfterSuppression: !!this.friendlyMgResponse,
      enemyMgDestroyed: this.near.some((actor) => actor.weaponId === "Type11" && !this.host.Alive(actor)),
      grenadeThrows: this.grenadeThrows || 0, lastGrenadePosition: this.lastGrenadePosition || null,
      retreatSmokeActive: !!this.smoke && this.time < this.smoke.until,
      retreatPursuit: (this.pursuit || []).map(entry=>({index:entry.index,alive:!!this.host.Alive(entry.actor),position:this.host.Position(entry.actor),target:entry.route[entry.index]})),
      weaponActionCount: this.weaponActionCount,
      guidePosition: sampledGuide, guideRouteIndex: this.guide?.index || 0,
      northRegroup,
      trainColumn:(this.trainColumn?.Entries()||[]).map(({actor,steps,...entry})=>entry),
      guideInspection:this.guideInspection||null,
      briefingStage:this.host.Signalled?.("P012BriefingComplete")?"complete":this.host.Signalled?.("P012BriefingStarted")?"briefing":this.host.Signalled?.("P012AmmoIssued")?"gathering":"issuing",
      briefingReadyCount:(this.openingCast||[]).filter(entry=>entry.ammoIssued&&this.host.Position(entry.actor)&&this.host.Position(this.host.GuideActor())
        &&Math.hypot(this.host.Position(entry.actor).x-this.host.Position(this.host.GuideActor()).x,this.host.Position(entry.actor).z-this.host.Position(this.host.GuideActor()).z)<10).length,
      openingCast: (this.openingCast || []).map(entry=>({actorId:entry.actor.id,age:entry.actor.identity?.age,modelVariant:entry.actor.actor?.modelVariant,position:this.host.Position(entry.actor),parking:entry.parking,index:entry.index,released:!!entry.released,
        stage:entry.stage||"muster",weaponIssued:!!entry.weaponIssued,ammoIssued:!!entry.ammoIssued,marchPlan:entry.marchPlan||null,
        marchComplete:!!entry.marchComplete,marchDefensePoint:entry.marchDefensePoint||null})),
      guideAlive: !!this.host.GuideActor() && !!this.host.Alive(this.host.GuideActor()),
      guideHealth: this.host.GuideActor()?.health ?? null, guideOrder: this.host.GuideActor()?.order ?? null,
      binocularOwned:!!this.binocularOwned,
      trafficReady: this.config.activities?.traffic ? !!this.trafficPassedNearPlayer : this.traffic.length === 6 && this.traffic.every((walker) => walker.index > 0),
      traffic: this.traffic.map((walker) => ({ side: walker.side, slot:walker.slot, role:walker.role, travelM:walker.travelM||0,
        actorId:walker.actor.id,child:!!walker.child,familyId:walker.familyId,guardianSlot:walker.guardianSlot,lateralM:walker.lateralM,speedMps:walker.actualSpeedMps??walker.speedMps,familyTarget:walker.familyTarget,
        index: walker.index, arrived:walker.arrived,retired:!!walker.retired,retiredAt:walker.retiredAt,parking:walker.parking,position: this.host.Position(walker.actor) })),
      nearEnemyDeaths: this.near.filter((actor) => !this.host.Alive(actor)).length,
      roadContactVisibleCount:this.near.filter(actor=>actor.alive!==false&&actor.p012RoadContact&&this.host.Visible?.(actor)).length,
      roadContactFriendlyCoverCount:(this.defenders||[]).filter((actor,index)=>{const at=this.host.Position(actor),cover=this.config.activities?.roadContactFriendlyCovers?.[index];return at&&cover&&Math.hypot(at.x-cover.x,at.z-cover.z)<2;}).length,
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
