// 03–05 persistent battlefield director. Geometry and routes: Data_FirstLevelFrontRoute.
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_FRONT_COLLECTION_ROUTE, MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_ENCOUNTERS, FRONT_BATTLE_OBJECTIVES as Objectives } from "./Data_FirstLevelMission.mjs";
import { MissionRouteProjection, MissionRoutePoint, MissionRouteLength, MissionRouteLookahead } from "./Script_FirstLevelMissionColumn.mjs";
import { InstallMissionSentry } from "./Script_FirstLevelMissionPeople.mjs";
import { FRONT_DEFENDERS } from "./Data_FirstLevelMissionFront.mjs";
import { SpeakingCastOptions } from "./Data_FirstLevelSpeakingCast.mjs";
import { TankClearFact } from "./Script_FirstLevelTankBrain.mjs";
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const AliveBatch=batch=>batch.filter(g=>g.actor.alive);
export function BatchRecovered(batch){return batch.length>0&&AliveBatch(batch).length>0&&AliveBatch(batch).every(g=>g.safe&&g.progress>=g.route.length);}
export function AssaultWindow(actors,captured,blocked,threshold=B.assaultKills){return captured&&actors.length>=threshold&&actors.filter(a=>a&&!a.alive).length>=threshold&&!blocked;}
// The player can reach Support while companions are still behind the rear bank.
// Join each actor's actual progress to the existing exit polyline; collection is
// not an unconditional first goal, and actors already there never walk back.
export function FrontEntryRoute(position,route){
  const joined=[...MISSION_STAGE_ROUTES.rearTrench.slice(0,4),...route];
  const {progress}=MissionRouteProjection(joined,position),remaining=[MissionRoutePoint(joined,progress)];
  let distance=0;
  for(let i=1;i<joined.length;i++){
    distance+=Distance(joined[i-1],joined[i]);
    if(distance>progress+.01)remaining.push({...joined[i]});
  }
  return remaining;
}
export class FirstLevelFrontBattle {
  constructor(runtime){this.r=runtime;this.walks=new Map();this.leg=null;this.blocked=true;}
  get Active(){return ["Support","MachineGun","Tank"].includes(this.r.flow.stage.id);}
  get Leader(){return this.r.companion.Handle("luo");}
  SetWalk(actor,route){if(!actor)return;this.walks.set(actor.id,{route:route.map(p=>({...p})),index:0});this.r.squadRoutes.set(actor.id,route.map(p=>({...p})));}
  Walk(actor,{follow=false,speed=R.squadSpeedMps}={}){
    const r=this.r,w=actor&&this.walks.get(actor.id);if(!actor?.alive||!w)return false;
    // Intermediate points describe checked trench corners. Advancing a metre
    // early cuts across the inside cover at the right-hand approach; this
    // corridor intentionally disables the AI's arbitrary obstacle detours.
    const Arrival=()=>w.index<w.route.length-1?B.arrivalM*.25:B.arrivalM;
    const previousIndex=w.index;
    while(w.index<w.route.length&&Distance(actor.position,w.route[w.index])<Arrival())w.index++;
    if(w.index!==previousIndex)w.rejoin=null;
    if(w.index>=w.route.length){r.Defend(actor,w.route.at(-1),0,.4);r.ai.SetStance(actor,1,.5,true);r.squadRoutes.set(actor.id,[]);return true;}
    if(r.RespondToGrenade(actor))return false;
    const ahead=MissionRouteProjection(w.route,actor.position).progress>MissionRouteProjection(w.route,r.player.position).progress+B.leaderLeadM;
    const wait=follow&&ahead&&Distance(actor.position,r.player.position)>S.leaderWaitM;
    // Crowd pressure or a grenade evade can leave an actor beside the checked
    // corridor. Keep one fixed return point until reached, so the next waypoint
    // cannot pull him back into the same cover every other frame.
    if(w.rejoin&&Distance(actor.position,w.rejoin)<B.arrivalM*.25)w.rejoin=null;
    if(!w.rejoin&&w.index>0){
      const segment=[w.route[w.index-1],w.route[w.index]],projection=MissionRouteProjection(segment,actor.position);
      if(projection.distance>B.arrivalM*.5)w.rejoin=MissionRoutePoint(segment,projection.progress);
    }
    actor.missionGuideWaiting=wait;r.squadMarch?.Release(actor);r.ai.ReleaseCover(actor);
    r.ai.SetStance(actor,1,.5,true);r.MoveActor(actor,w.rejoin||w.route[w.index],wait?0:speed);
    actor.scriptArrivalRadius=Math.min(actor.scriptArrivalRadius,(w.rejoin?B.arrivalM*.25:Arrival())*.5);
    r.squadRoutes.set(actor.id,w.route.slice(w.index));
    if(wait)r.leaderGuide?.Watch(actor);return false;
  }
  SetLeg(id,route){if(this.leg===id)return;this.leg=id;this.leaderRoute=route;this.SetWalk(this.Leader,route);}
  Prepare(){
    const r=this.r;
    if(!r.frontDefenders?.length)r.frontDefenders=FRONT_DEFENDERS.map(spec=>{
      const actor=r.ai.Spawn("nra",spec.x,spec.z,{weapon:spec.weapon,squadId:"MissionFrontDefense"});
      if(actor){InstallMissionSentry(actor);actor.missionId=spec.id;r.Defend(actor,spec);r.ai.SetStance(actor,spec.stance,Infinity,true);
        actor.scriptAccuracyScale=R.defenderAccuracyScale;actor.scriptFireIntervalScale=R.defenderFireIntervalScale;}
      return actor;
    }).filter(Boolean);
    r.SpawnGuards();
    if(!r.Has("zhouGunWounded"))r.opening.SpawnZhou();
  }
  Enter(stage){
    if(["BunkerRescue","Support"].includes(stage))this.Prepare();
    if(!this.Active)return;const r=this.r;
    for(const actor of r.squad){actor.missionTrainReady=true;actor.scriptedNoncombatant=false;actor.missionNaturalMarch=false;}
    if(stage==="Support"){
      this.SetLeg("capture",FrontEntryRoute(this.Leader.position,[...Routes.support.slice(0,-1),S.leaderCover]));r.Record("frontBattleStarted");r.frontBattleAt=r.time;
      r.tank.present=false;r.tank.active=false;
      for(const [role,route] of [
        ["heyoutian",[...MISSION_FRONT_COLLECTION_ROUTE,...S.leftRoute.slice(1,-1)]],
        ["liuwencai",[...MISSION_FRONT_COLLECTION_ROUTE,{x:-18,z:-123}]],
        ["yaowa",[...MISSION_FRONT_COLLECTION_ROUTE,...S.leftRoute.slice(1,-2)]],
      ]){const actor=r.companion.Handle(role);if(actor)this.SetWalk(actor,FrontEntryRoute(actor.position,route));}
      r.Say("FrontBlockade");
    }
    if(stage==="MachineGun"){r.Say("TankRoadContact");r.tank.present=true;r.tank.active=true;this.SetLeg("cover",[S.leaderCover]);}
    if(stage==="Tank"){r.emplacement.Vacate("sortie");this.SetLeg("supply",Routes.bundle);r.EnsureBundleKeeper();r.Say("BundleGo");}
  }
  InfantryBlockade(){
    const r=this.r;
    return [S.gap,{x:S.gap.x,z:S.gap.z-2},{x:S.gap.x,z:S.gap.z+2}].some(p=>r.Threatens(p,null,B.guardHeightM,B.blockadeRangeM));
  }
  TankBlockade(){
    const r=this.r,t=r.tank;
    // 大脑接管时（t.brain）断履带不等于解围：MobilityKill 的炮塔与机枪照样封口，Disabled 才算。
    if(!t.active||t.fireDisabled||(!t.brain&&t.immobilized)||!r.Has("tankPositionPressured"))return false;
    return !r.BlocksSight(r.view.TankMuzzle(t),r.Point(S.gap,B.guardHeightM),r.view.tankCollider);
  }
  Update(dt){
    if(!this.Active)return;const r=this.r,stage=r.flow.stage.id;
    for(const cast of ["heyoutian","liuwencai","yaowa"])this.Walk(r.companion.Handle(cast),{
      speed:cast==="yaowa"&&this.walks.has(r.opening.zhou?.id)&&!r.Has("zhouGunWounded")?R.walkSpeedMps:R.squadSpeedMps});
    this.Walk(this.Leader,{follow:true});
    this.blocked=this.InfantryBlockade()||this.TankBlockade();
    if(stage==="Support")this.UpdateCapture();
    if(stage==="MachineGun")this.UpdatePressure();
    if(stage==="Tank")this.UpdateSortie();
  }
  UpdateCapture(){
    const r=this.r;
    if(r.Near(S.approach[3],5))r.Say("FrontApproach");
    const defenders=MISSION_ENCOUNTERS.approach.map(s=>r.enemies.get(s.id));
    if(r.Near(S.nest,B.captureRadiusM)&&Distance(this.Leader.position,S.nest)<B.captureRadiusM
      &&defenders.every(a=>a&&!a.alive)){
      r.Record("frontReached");r.Record("rightNestCaptured");r.Say("FrontAttack");this.SetLeg("cover",[S.leaderCover]);
    }
    if([...r.enemies.values()].some(a=>a.lastFire>0)||r.Inventory().shots>0)r.Record("frontContact");
    const assault=B.assaultIds.map(id=>r.enemies.get(id));
    if(AssaultWindow(assault,r.Has("rightNestCaptured"),this.blocked)){r.Record("frontRifleDefense");r.Say("FrontWithdraw");}
    if(r.Has("rifleWithdrawalResolved")){
      r.tank.present=true;r.tank.active=true;
      const he=r.companion.Handle("heyoutian");
      if(!this.handoverStarted){this.handoverStarted=true;this.SetWalk(he,[...S.leftRoute.slice(-2)]);r.Say("TakeOverGun");}
      if(Distance(he.position,S.leftSeat)<B.arrivalM&&!r.emplacement.guns.get(r.leftGunId)?.npc){r.emplacement.NpcOccupy(r.leftGunId,he);r.Record("leftGunHandover");}
    }
  }
  UpdatePressure(){
    const r=this.r;
    if(r.Has("tankPositionPressured")){
      this.SetLeg("rear",S.rearRoute);
      if(r.Near(S.rear,B.rearArrivalM)&&Distance(this.Leader.position,S.rear)<B.rearArrivalM
        &&r.BlocksSight(r.view.TankMuzzle(r.tank),r.player.EyePosition,r.view.tankCollider)){
        r.Record("rightRearReached");r.Say("BundleOrder");
      }
    }
    const atBlock=r.tank.brain?!!r.tank.atBlock:(r.tank.roadProgress||0)>=this.RoadDistance(S.tankBlockIndex)-.2;
    if(atBlock&&this.TankBlockade())r.Record("tankBlocksExit");
  }
  UpdateSortie(){
    const r=this.r;
    if(!r.Has("bundleTaken"))return;
    const bundles=r.Inventory().bundles;if(this.bundleCount!=null&&bundles<this.bundleCount)r.Say("BundleRetreat");this.bundleCount=bundles;
    if(!r.Has("bundleReturned")){
      this.SetLeg("return",Routes.bundleReturn);
      if(r.Near(S.rear,B.rearArrivalM)&&Distance(this.Leader.position,S.rear)<B.rearArrivalM)r.Record("bundleReturned");
      return;
    }
    // 大脑接管时断履带不算解决（炮塔机枪还活着、还封口）：带路人留在攻击位，Disabled 以后才撤。
    if(!r.Has(TankClearFact(r.tank))){
      this.SetLeg("attack",S.attackRoute);
      if(r.Near(S.throw,B.attackArrivalM)&&Distance(this.Leader.position,S.throw)<B.rearArrivalM){r.Record("attackPositionReached");r.Say("BundleAttack");}
      return;
    }
    // Contract v1.1 deadlock ②: the tank can be finished before the pair both stand on the attack position (the player
    // throws from the branch, or ahead of a lagging Luo). The beat is over, not pending - record it as skipped instead of
    // waiting forever for an attack position nobody needs any more.
    if(!r.Has("attackPositionReached"))r.Record("attackPositionReached",{skipped:true,reason:"tankClearedFirst",
      playerAtThrow:r.Near(S.throw,B.attackArrivalM),leaderAtThrow:Distance(this.Leader.position,S.throw)<B.rearArrivalM});
    if(r.Near(S.rear,B.rearArrivalM))r.Record("attackRetreated");
    if(!r.Has("lastGuardsWithdrawn")){this.SetLeg("retreat",[...S.attackRoute].reverse());return;}
    this.SetLeg("disengage",Routes.orders.slice(S.attackRoute.length-1));
    this.playerLeftFront ||= r.Near(S.approach[0],B.rearArrivalM);
    this.leaderLeftFront ||= Distance(this.Leader.position,S.approach[0])<B.rearArrivalM;
    if(this.playerLeftFront&&this.leaderLeftFront)r.Record("frontDisengaged");
    if(r.Has("frontDisengaged")&&r.Has("reliefInPosition")&&r.Near(A.collection,B.rearArrivalM)
      &&Distance(this.Leader.position,A.collection)<B.rearArrivalM)r.Record("collectionReturned");
  }
  UpdateGuards(dt){
    const r=this.r;if(!this.Active)return;
    const first=r.guards.slice(0,B.firstBatch),last=r.guards.slice(B.firstBatch);
    for(const batch of [first,last])if(batch.length&&!AliveBatch(batch).length){
      r.Record("guardBatchLost",{batch:batch===first?1:2});r.OnPlayerDown();r.MissionFailure?.("guards");return;
    }
    const stage=r.flow.stage.id;
    const clear=!this.InfantryBlockade()&&!this.TankBlockade();
    for(const [i,g] of r.guards.entries()){
      const firstBatch=i<B.firstBatch;
      const released=firstBatch?r.Has("rightNestCaptured")&&r.Has("frontRifleDefense"):
        r.Has("tankImmobilized")&&r.Has("tankFireDisabled");
      // 2026-09-23: guards waiting to be relieved are not an AI target. A whole guard batch dying is a
      // mission failure, and the last assault line sits 11 m from their trench: once the front stopped
      // being yanked sideways every few seconds (docs/Data_EnemyAi.md §19), the men there stayed under
      // the combat brain, saw the prone guards, shared them on the blackboard and bayonet-charged them
      // before the player reached the nest (both batch guards dead by RightNestApproach, campaign
      // 03-06 red twice). Same authored protection as the near-tactic standby: the fight for these men
      // starts when the player relieves them, not offscreen.
      // 2026-09-24 (contract §2.9): the protection now lasts through the crossing until the man is in the safe zone.
      // "Released guards are fair game" let the last bound line shoot the whole second batch in the gap (one of
      // them with a bayonet charge at 1 m) -> guardBatchLost (Space package cold start, docs §10.3).
      g.actor.missionUntargetable=g.actor.alive&&!g.safe;
      if(!g.actor.alive||g.progress>=g.route.length)continue;
      // The nearest man probes the visible breach once, then returns to his original cover.
      // This is real movement of the existing defender, with no scripted casualty or teleport.
      if(i===0&&!r.Has("rightNestCaptured")){
        if(!g.probe&&r.Near(S.approach[0],12))g.probe="forward";
        if(g.probe==="forward"||g.probe==="return"){
          const target=g.probe==="forward"?S.guardRoute[1]:g.route[0];
          if(Distance(g.actor.position,target)<B.arrivalM)g.probe=g.probe==="forward"?"return":"complete";
          if(g.probe!=="complete"){r.ai.SetStance(g.actor,1,.5,true);r.MoveActor(g.actor,target,R.guardSpeedMps);continue;}
        }
      }
      // Stage 04 moves the existing second batch to the last covered line, never across the gap.
      const gather=!firstBatch&&stage!=="Support";
      if(g.progress===0)g.progress=1;
      if(!released||!clear){
        if(g.crossing){/* finish the exposed bound into the next cover */}
        else if(gather&&g.progress<=1){
          const hold={x:S.lastCover.x+(i-B.firstBatch)*B.gatherSpacingM,z:S.lastCover.z};
          if(Distance(g.actor.position,hold)>B.arrivalM){r.ai.SetStance(g.actor,1,.5,true);r.MoveActor(g.actor,hold,R.guardSpeedMps);continue;}
          g.gathered=true;r.Defend(g.actor,hold,0,0);r.ai.SetStance(g.actor,B.guardWaitStance,.5,true);continue;
        }else {r.Defend(g.actor,g.actor.position,0,0);r.ai.SetStance(g.actor,B.guardWaitStance,.5,true);continue;}
      }
      if(!g.crossing){
        const ahead=r.guards.slice(0,i).some(other=>other.actor.alive&&other.crossing&&!other.safe);
        if(ahead)continue;
      }
      g.crossing=true;g.actor.scriptedNoncombatant=false;
      while(g.progress<g.route.length&&Distance(g.actor.position,g.route[g.progress])<B.arrivalM)g.progress++;
      if(g.progress>=g.route.length){g.safe=true;r.Record(`guardWithdrawn${g.actor.id}`);r.Defend(g.actor,g.route.at(-1),0,0);continue;}
      r.ai.SetStance(g.actor,0,.5,true);r.MoveActor(g.actor,g.route[g.progress],R.guardSpeedMps);
    }
    if(BatchRecovered(first))r.Record("rifleWithdrawalResolved",{survived:AliveBatch(first).length});
    if(last.length&&AliveBatch(last).every(g=>g.gathered))r.Record("remainingGuardsGathered");
    if(BatchRecovered(last)&&r.Has("tankFireDisabled")){
      r.Record("lastGuardsWithdrawn",{survived:AliveBatch(last).length});r.Record("guardWithdrawalResolved");
    }
  }
  UpdateZhou(){
    const r=this.r,a=r.opening.zhou;if(!a||r.Has("zhouGunWounded"))return;
    if(!a.alive){r.Record("zhouGunKilled");r.OnPlayerDown();r.MissionFailure?.("zhou");return;}
    if(!a.frontWoundEstablished){a.frontWoundEstablished=true;a.health=Math.min(a.health,B.zhouHealth);a.wounded=true;a.woundedWalk=1;}
    if(!r.Has("rifleWithdrawalResolved")){r.Defend(a,S.leftSeat,0,.4);return;}
    const yaowa=r.companion.Handle("yaowa");
    if(!this.zhouEscortDispatched){this.zhouEscortDispatched=true;this.SetWalk(yaowa,S.leftRoute.slice(-3));}
    if(!this.walks.has(a.id)){
      if(Distance(yaowa.position,a.position)>B.rearArrivalM)return;
      r.emplacement.NpcVacate(r.leftGunId,"woundedWithdrawal");
      const route=[...S.leftRoute].reverse().concat([...MISSION_FRONT_COLLECTION_ROUTE].reverse().slice(1),[P.collection.zhouWall]);
      this.SetWalk(a,route);this.SetWalk(yaowa,route);
    }
    if(this.Walk(a,{speed:R.walkSpeedMps})){
      Object.assign(r.column.zhou,{x:a.position.x,z:a.position.z,health:a.health,visible:true,state:"waiting"});
      r.Record("zhouGunWounded",{priorWound:true,x:a.position.x,z:a.position.z});r.ai.Remove(a);this.SetWalk(yaowa,[{x:-33,z:-100}]);
    }
  }
  RoadDistance(index){return MissionRouteLength(S.road.slice(0,index+1));}
  MoveTank(dt){
    const r=this.r,t=r.tank,stage=r.flow.stage.id;
    let limit=this.RoadDistance(stage==="Support"?S.tankPreviewIndex:stage==="MachineGun"?S.tankBlockIndex:S.tankEndIndex);
    t.roadProgress??=MissionRouteProjection(S.road,t).progress;
    const canMove=t.active&&!t.immobilized&&t.roadProgress<limit;
    // Stop to fire on the captured front before proceeding to the actual breach.
    const pressure=this.RoadDistance(S.tankPressureIndex);
    if(stage==="MachineGun"&&!r.Has("tankPositionPressured"))limit=Math.min(limit,pressure);
    const advance=t.advanceTime%(R.tankAdvanceSeconds+R.tankFiringHaltSeconds)<R.tankAdvanceSeconds;
    const next=Math.min(limit,t.roadProgress+(canMove&&advance?dt*R.tankSpeedMps:0));
    t.moving=next>t.roadProgress;t.roadProgress=Math.max(t.roadProgress,next);
    const p=MissionRoutePoint(S.road,t.roadProgress),ahead=MissionRoutePoint(S.road,t.roadProgress+.5);
    t.x=p.x;t.z=p.z;t.moveYaw=Math.atan2(p.x-ahead.x,p.z-ahead.z);
    t.battleTarget=r.Has("tankPositionPressured")?S.gap:S.nest;
    for(const [i,spec] of MISSION_ENCOUNTERS.tank.entries()){
      const actor=r.enemies.get(spec.id);if(!actor?.alive)continue;
      const progress=MissionRouteProjection(S.road,actor.position).progress,target=Math.max(0,t.roadProgress-7-i*3);
      if(progress<target-1){r.ai.SetStance(actor,0,.5,true);r.MoveActor(actor,MissionRoutePoint(S.road,Math.min(progress+4,target)),R.assaultRushMps);}
      else r.Defend(actor,actor.position,0,.5);
    }
    if(stage==="Support"&&t.roadProgress>=limit-.2)r.Record("tankPreviewed");
  }
  UpdateRelief(dt){
    const r=this.r;if(!r.Has("lastGuardsWithdrawn")||!["Tank","Orders"].includes(r.flow.stage.id))return;
    if(!r.relief){
      r.relief=P.reliefPositions.map((post,i)=>{
        const actor=r.ai.Spawn("nra",A.collection.x+i*1.5,A.collection.z,{weapon:i?"HanYang":"Zb26",squadId:"MissionRelief",...(i?{}:SpeakingCastOptions("relief"))});
        if(!actor)return null;InstallMissionSentry(actor);actor.missionId=`Relief${i}`;
        this.SetWalk(actor,[...MISSION_FRONT_COLLECTION_ROUTE,...(i?[post]:S.leftRoute.slice(1))]);
        return {actor,arrived:false,index:0,distance:0,delay:0,route:this.walks.get(actor.id).route};
      }).filter(Boolean);
    }
    for(const e of r.relief){e.arrived=this.Walk(e.actor);e.index=this.walks.get(e.actor.id)?.index||0;}
    if(r.relief.length===P.reliefPositions.length&&r.relief.every(e=>e.actor.alive&&e.arrived)){
      r.Record("reliefInPosition");r.Say("FrontRelief");
      if(!this.postsRelieved){
        this.postsRelieved=true;r.emplacement.NpcVacate(r.leftGunId,"relief");
        this.SetWalk(r.companion.Handle("heyoutian"),[...S.leftRoute].reverse().concat([...MISSION_FRONT_COLLECTION_ROUTE].reverse().slice(1)));
        this.SetWalk(r.companion.Handle("liuwencai"),[{x:-17,z:-124},...MISSION_FRONT_COLLECTION_ROUTE.slice(-1),...[...MISSION_FRONT_COLLECTION_ROUTE].reverse().slice(1)]);
        r.emplacement.NpcOccupy(r.leftGunId,r.relief[0].actor);
      }
    }
    if(this.postsRelieved&&r.flow.stage.id==="Orders")for(const id of ["heyoutian","liuwencai"])this.Walk(r.companion.Handle(id));
  }
  Guide(){
    const r=this.r;if(!this.Active)return null;
    const stage=r.flow.stage.id;
    if(stage==="Support")return r.Has("rightNestCaptured")?{target:S.gap,label:"front",objective:Objectives.coverFirst}:{target:MissionRouteLookahead(Routes.support,r.player.position),label:"support",objective:Objectives.capture};
    if(stage==="MachineGun")return r.Has("tankPositionPressured")?{target:MissionRouteLookahead(S.rearRoute,r.player.position),label:"bundle",objective:Objectives.rear}:{target:S.gap,label:"front",objective:Objectives.coverRest};
    const labels={supply:"bundle",return:"bundle",attack:"throw",retreat:"front",disengage:"orders"};
    return {target:!r.Has("bundleTaken")&&r.Near(S.house,S.supplierRangeM)?A.bundle:MissionRouteLookahead(this.leaderRoute||Routes.bundle,r.player.position),label:labels[this.leg]||"bundle",objective:Objectives[this.leg]||Objectives.supply};
  }
  State(){return {leg:this.leg,blocked:this.blocked,roadProgress:this.r.tank.roadProgress||0,walks:[...this.walks].map(([id,w])=>({id,index:w.index,total:w.route.length}))};}
}
