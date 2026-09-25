// 03–05 persistent battlefield director. Geometry and routes: Data_FirstLevelFrontRoute.
import { FRONT_SORTIE as S, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
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
import { MISSION_VOICE_CAST } from "./Data_FirstLevelMissionDialogue.mjs";
import { ZhouGunExitRoute } from "./Script_FirstLevelOpening.mjs";
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const AliveBatch=batch=>batch.filter(g=>g.actor.alive);
/** Route split at the point nearest to `point`: [head ending there, tail starting there]. */
export function SplitRoute(route,point){
  const {progress}=MissionRouteProjection(route,point),at=MissionRoutePoint(route,progress),head=[],tail=[{x:at.x,z:at.z}];
  let distance=0;head.push({...route[0]});
  for(let i=1;i<route.length;i++){
    distance+=Distance(route[i-1],route[i]);
    if(distance<progress-.01)head.push({...route[i]});else if(distance>progress+.01)tail.push({...route[i]});
  }
  head.push({x:at.x,z:at.z});
  return [head,tail];
}
/** The guard is safe, or at least B.gapClearM beyond the gap along his withdrawal route (in covered trench). */
export function GuardClearOfGap(g,gap=S.gap){
  if(g.safe)return true;
  const i=g.route.findIndex(p=>Distance(p,gap)<.01);if(i<0)return false;
  const {progress}=MissionRouteProjection(g.route,g.actor.position),at=MissionRouteLength(g.route.slice(0,i+1));
  return progress>=at+B.gapClearM;
}
/** Every live guard of the batch is safe or already past the gap (contract §2.6: 05 relief and return run in parallel). */
export function BatchPastGap(batch,gap=S.gap){
  return AliveBatch(batch).every(g=>{
    if(g.safe)return true;
    const i=g.route.findIndex(p=>Distance(p,gap)<.01);
    return i>=0&&g.progress>i;
  });
}
/**
 * 06 departure (contract v1.1 deadlock ①): the litters start the step already spaced out along the route
 * (the lead one at count x litterSpacingM), so "some litter has progress >= spacing" was true on the very frame
 * zhouOnLitter was recorded - 07 started before Zhou's litter left the wall and it stayed "fallen" for good.
 * The column has departed only once Zhou is on a litter that is in the queue (not "fallen") and the column has
 * then really moved: the furthest-moving litter advanced spacingM beyond where it stood at that moment.
 */
export function ColumnDeparture(baseline,litters,spacingM){
  const zhou=litters.find(l=>l.zhou);
  if(!zhou||zhou.state==="fallen")return {baseline:null,departed:false,lead:0};
  const base=baseline||new Map(litters.map(l=>[l.id,l.progress]));
  const lead=Math.max(0,...litters.map(l=>l.progress-(base.get(l.id)??l.progress)));
  return {baseline:base,departed:lead>=spacingM,lead};
}
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
/** Where the relief gunner waits for He to leave the left gun: B.reliefGunStandbyM back along leftRoute's last leg. */
function ReliefGunStandby(){const a=S.leftRoute.at(-2),b=S.leftSeat,d=Math.hypot(a.x-b.x,a.z-b.z),k=Math.min(1,B.reliefGunStandbyM/Math.max(d,1e-6));return {x:b.x+(a.x-b.x)*k,z:b.z+(a.z-b.z)*k};}

export class FirstLevelFrontBattle {
  constructor(runtime){
    this.r=runtime;this.walks=new Map();this.leg=null;this.blocked=true;
    /** Walk stall skips (probes read State().stalls): {id,index,total,final,x,z,at}. */
    this.stalls=[];
    /** Task-side grenade veto (Script_AiTactics TacticsDirector.grenadeVeto), installed by the runtime while Active. */
    this.grenadeVeto=(soldier,x,z)=>this.GuardInBlast(x,z);
  }
  /** A protected (missionUntargetable) guard is within B.guardGrenadeShieldM of (x,z): no grenade there (contract §2.9). */
  GuardInBlast(x,z){
    for(const g of this.r.guards||[]){const a=g.actor;if(a?.alive&&a.missionUntargetable&&Math.hypot(a.position.x-x,a.position.z-z)<B.guardGrenadeShieldM)return true;}
    return false;
  }
  get Active(){return ["Support","MachineGun","Tank"].includes(this.r.flow.stage.id);}
  get Leader(){return this.r.companion.Handle("luo");}
  SetWalk(actor,route){if(!actor)return;this.walks.set(actor.id,{route:route.map(p=>({...p})),index:0});this.r.squadRoutes.set(actor.id,route.map(p=>({...p})));}
  Walk(actor,{follow=false,speed=R.squadSpeedMps}={}){
    const r=this.r,w=actor&&this.walks.get(actor.id);if(!actor?.alive||!w)return false;
    // Stepping into the player's picture for a line (FrontScenes.Steer moves him): no walk order, no stall clock.
    if(r.frontScenes?.Steers?.(actor)){w.bestAt=r.time;return false;}
    // Intermediate points describe checked trench corners. Advancing a metre
    // early cuts across the inside cover at the right-hand approach; this
    // corridor intentionally disables the AI's arbitrary obstacle detours.
    const Arrival=()=>w.index<w.route.length-1?B.arrivalM*.25:B.arrivalM;
    const previousIndex=w.index;
    while(w.index<w.route.length&&Distance(actor.position,w.route[w.index])<Arrival())w.index++;
    if(w.index!==previousIndex){w.rejoin=null;w.best=Infinity;w.bestAt=r.time;}
    if(w.index>=w.route.length){r.Defend(actor,w.route.at(-1),0,.4);r.ai.SetStance(actor,1,.5,true);r.squadRoutes.set(actor.id,[]);return true;}
    if(r.RespondToGrenade(actor)){w.bestAt=r.time;return false;}
    const ahead=MissionRouteProjection(w.route,actor.position).progress>MissionRouteProjection(w.route,r.player.position).progress+B.leaderLeadM;
    const wait=follow&&ahead&&Distance(actor.position,r.player.position)>S.leaderWaitM;
    // Stall fallback: intermediate points only count within 0.25 m, so a man shoved off the line (a gun block, a
    // crowd, a crater edge) could hold one point for good - Luo 200 s beside the captured gun's seat, the relief
    // gunner 70 s on the leftRoute leg (09-24 review). No progress for B.walkStallS -> skip the point, or take a
    // final point as reached within arrivalM x walkStallArrivalScale.
    const d=Distance(actor.position,w.route[w.index]);
    if(!(w.best<Infinity)||w.bestAt==null){w.best=d;w.bestAt=r.time;}
    if(wait||d<w.best-B.walkStallProgressM){w.best=Math.min(w.best,d);w.bestAt=r.time;}
    else if(r.time-w.bestAt>=B.walkStallS){
      const final=w.index===w.route.length-1;
      if(!final||d<B.arrivalM*B.walkStallArrivalScale){
        this.stalls.push({id:actor.missionId||actor.castId||actor.id,index:w.index,total:w.route.length,final,
          x:+actor.position.x.toFixed(1),z:+actor.position.z.toFixed(1),at:+r.time.toFixed(1)});
        if(this.stalls.length>24)this.stalls.shift();
        // No rejoin point on the next segment: its foot is where he was stuck, it would pull him straight back.
        w.index++;w.rejoin=null;w.noRejoin=w.index;w.best=Infinity;w.bestAt=r.time;
        if(w.index>=w.route.length){r.Defend(actor,w.route.at(-1),0,.4);r.ai.SetStance(actor,1,.5,true);r.squadRoutes.set(actor.id,[]);return true;}
      }else w.bestAt=r.time;
    }
    // Crowd pressure or a grenade evade can leave an actor beside the checked
    // corridor. Keep one fixed return point until reached, so the next waypoint
    // cannot pull him back into the same cover every other frame.
    if(w.rejoin&&Distance(actor.position,w.rejoin)<B.arrivalM*.25)w.rejoin=null;
    if(!w.rejoin&&w.index>0&&w.noRejoin!==w.index){
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
        ["liuwencai",[...MISSION_FRONT_COLLECTION_ROUTE,...S.approach.slice(1,4),B.liuMeetPost]],
        ["yaowa",[...MISSION_FRONT_COLLECTION_ROUTE,...S.leftRoute.slice(1,-2)]],
      ]){const actor=r.companion.Handle(role);if(actor)this.SetWalk(actor,FrontEntryRoute(actor.position,route));}
    }
    if(stage==="MachineGun"){
      r.Say("TankRoadContact");r.tank.present=true;r.tank.active=true;this.SetLeg("cover",[S.leaderCover]);
      // A debug start at 04 never ran the 03 handover: send He to the left gun now.
      this.StartHandover(false);
    }
    if(stage==="Tank"){r.emplacement.Vacate("sortie");this.SetLeg("supply",[...Routes.bundle.slice(0,-1),S.leaderDoorSide]);r.EnsureBundleKeeper();r.Say("BundleGo");}
  }
  /** 03 handover: He Youtian walks the last leg of the left gun access trench and takes the gun Zhou leaves. */
  StartHandover(say=true){
    if(this.handoverStarted)return;
    const r=this.r,he=r.companion.Handle("heyoutian");if(!he)return;
    // A 04 checkpoint places He on the seat already: do not send him 9 m up the access trench and back.
    const onSeat=Distance(he.position,S.leftSeat)<B.handoverReadyM;
    this.handoverStarted=true;this.SetWalk(he,onSeat?[S.leftSeat]:[...S.leftRoute.slice(-2)]);if(say)r.Say("TakeOverGun");
  }
  UpdateHandover(){
    const r=this.r,he=r.companion.Handle("heyoutian");
    if(!this.handoverStarted||this.postsRelieved||!he?.alive)return;
    // Not gated on the fact: a debug start at 04 already carries leftGunHandover, He still has to sit down.
    const gun=r.emplacement.guns.get(r.leftGunId);if(gun?.npc)return;
    if(Distance(he.position,S.leftSeat)<B.arrivalM){r.emplacement.NpcOccupy(r.leftGunId,he);r.Record("leftGunHandover");return;}
    // The seat is free but He stands off it. His walk can end while Zhou still holds the gun (He reached arrivalM
    // first, UpdateZhou waits for Yaowa); the two then shove each other off the seat and the hold order leaves He
    // wherever he was pushed - 1.31 m off, 240 s, 03 never ended (09-24 01->06 verify run). Walk him on again.
    const w=this.walks.get(he.id);if(!w||w.index>=w.route.length)this.SetWalk(he,[S.leftSeat]);
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
    this.UpdateHandover();
    // Sound package's music stinger: the gap is open again (tank silenced and no one fires on the gap).
    if(stage==="Tank"&&r.Has(TankClearFact(r.tank))&&!this.blocked)r.Record("breachReopened");
    if(stage==="Support")this.UpdateCapture();
    if(stage==="MachineGun")this.UpdatePressure();
    if(stage==="Tank")this.UpdateSortie();
  }
  UpdateCapture(){
    const r=this.r;
    // K3: Zhou and Luo shout across the observation step, where the player first sees the pinned guards, the gap
    // and the burning nest (it used to fire at 0 s of the step with Zhou 50 m away: Voice report).
    if(r.Near(Space.observationSpur[0],B.observationCallM)||r.Near(Space.fold,B.observationCallM))r.Say("FrontBlockade");
    // "贴这道墙！前头有人！" belongs to the right low trench, 12-20 m short of the nest's west door.
    if(r.Near(S.approach[B.frontApproachCallIndex],5))r.Say("FrontApproach");
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
      this.StartHandover();
    }
  }
  UpdatePressure(){
    const r=this.r;
    if(r.Has("tankPositionPressured")){
      // rearRoute[0] is the captured gun's seat (the player's way back from it). Luo holds his cover north of the gun:
      // walking to the seat from there puts the gun block between him and the point (09-24 review: 200 s at
      // (23.3,-153.8), 2.6 m short, rightRearReached never came). He starts at the next corner instead.
      this.SetLeg("rear",S.rearRoute.slice(1));
      const playerHere=r.Near(S.rear,B.rearArrivalM)&&r.BlocksSight(r.view.TankMuzzle(r.tank),r.player.EyePosition,r.view.tankCollider);
      if(!playerHere)this.playerAtRearAt=null;
      else {
        this.playerAtRearAt??=r.time;
        const leaderHere=Distance(this.Leader.position,S.rear)<B.rearArrivalM;
        // Fallback: the player has held the junction B.rearLeaderGraceS and Luo is still on his way - go on anyway.
        if(leaderHere||r.time-this.playerAtRearAt>=B.rearLeaderGraceS){
          r.Record("rightRearReached",leaderHere?undefined:{leaderLate:true,leader:{x:+this.Leader.position.x.toFixed(1),z:+this.Leader.position.z.toFixed(1)}});
          r.Say("BundleOrder");
        }
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
      this.SetLeg("attack",[...S.attackRoute.slice(0,-1),S.leaderAttackSide]);
      if(r.Near(S.throw,B.attackArrivalM)&&Distance(this.Leader.position,S.throw)<B.rearArrivalM){r.Record("attackPositionReached");r.Say("BundleAttack");}
      return;
    }
    // Contract v1.1 deadlock ②: the tank can be finished before the pair both stand on the attack position (the player
    // throws from the branch, or ahead of a lagging Luo). The beat is over, not pending - record it as skipped instead of
    // waiting forever for an attack position nobody needs any more.
    if(!r.Has("attackPositionReached"))r.Record("attackPositionReached",{skipped:true,reason:"tankClearedFirst",
      playerAtThrow:r.Near(S.throw,B.attackArrivalM),leaderAtThrow:Distance(this.Leader.position,S.throw)<B.rearArrivalM});
    if(r.Near(S.rear,B.rearArrivalM))r.Record("attackRetreated");
    if(!r.Has("attackRetreated")){this.SetLeg("retreat",[...S.attackRoute].reverse());return;}
    // Contract §2.6: the last batch's crossing, the relief and the pair's return run in parallel. The pair walks
    // back through the nest and holds at its west door (K10: the gap is in view 34 m away) until every live man of
    // the last batch is past the gap, then goes on down the right low trench to the safe zone (returnMeet), where
    // the batch, Liu and the relief NCO meet them (FrontRelief), and on to the collection.
    const back=Routes.orders.slice(S.attackRoute.length-1),[toDoor,fromDoor]=SplitRoute(back,Space.westDoor),[toMeet,home]=SplitRoute(fromDoor,Space.returnMeet);
    const last=r.guards.slice(B.firstBatch);
    this.gapWatched ||= BatchPastGap(last);
    if(!this.gapWatched){this.SetLeg("gapWatch",toDoor);return;}
    // frontDisengaged = both back in our own trench behind the fold (the safe zone, FRONT_SPACE.returnMeet). The old
    // point S.approach[0] became the support junction SJ next to the collection in the 09.23 space. A player who ran
    // on past the meeting counts by his progress along the return route.
    const reach=Math.max(B.rearArrivalM,Space.returnMeet.radiusM),meetAt=MissionRouteProjection(back,Space.returnMeet).progress-reach;
    this.playerLeftFront ||= MissionRouteProjection(back,r.player.position).progress>=meetAt;
    this.leaderLeftFront ||= MissionRouteProjection(back,this.Leader.position).progress>=meetAt;
    if(this.playerLeftFront&&this.leaderLeftFront)r.Record("frontDisengaged");
    if(!this.returnMeetDone){
      this.SetLeg("disengage",toMeet);
      if(Distance(this.Leader.position,Space.returnMeet)<Space.returnMeet.radiusM)this.meetHoldAt??=r.time;
      this.returnMeetDone=r.voice.played.has("FrontRelief")||(this.meetHoldAt!=null&&r.time-this.meetHoldAt>=B.returnMeetMaxWaitS);
      if(!this.returnMeetDone)return;
    }
    this.SetLeg("home",home);
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
        // The probe is for the player to see (K3): start it when he reaches the observation step, not at SJ 45 m back.
        if(!g.probe&&(r.Near(Space.observationSpur[0],B.observationCallM)||r.Near(Space.fold,B.observationCallM)))g.probe="forward";
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
        // One man in the exposed gap at a time, but the next one goes as soon as the man ahead is gapClearM past
        // the gap (the trench behind it is covered). Waiting until he was in the safe zone 40-60 m on made the
        // six-man batch cross in ~90 s (Step 2 campaign run 2: tankFireDisabled 313 s -> last man past the gap ~400 s).
        const ahead=r.guards.slice(0,i).some(other=>other.actor.alive&&other.crossing&&!other.safe&&!GuardClearOfGap(other));
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
    if(!a.frontWoundEstablished){a.frontWoundEstablished=true;a.health=Math.min(a.health,B.zhouHealth);a.wounded=true;a.woundedWalk=1;
      a.identity={...a.identity,name:MISSION_VOICE_CAST.zhou?.[0]??a.identity?.name,age:B.zhouAge};}
    // Checkpoint start at 04 (the 03 facts carry zhouLeftGun, but no walk of his exists in this runtime): the
    // handover is history. Zhou (respawned on the seat by Opening.Update) starts down the access trench past the
    // 10 m line with Yaowa, instead of sharing the seat with He, whom the checkpoint also puts there (09-24 review).
    if(r.Has("zhouLeftGun")&&!this.walks.has(a.id)){
      const at=S.zhouExit[2],yaowa=r.companion.Handle("yaowa"),route=[...ZhouGunExitRoute(at),P.collection.zhouWall];
      r.emplacement.NpcVacate(r.leftGunId,"checkpoint");r.PlaceActor(a,at);this.SetWalk(a,route);
      if(yaowa){r.PlaceActor(yaowa,{x:at.x+1,z:at.z+1.2});this.SetWalk(yaowa,route);}
      this.zhouEscortDispatched=true;
    }
    if(!r.Has("rifleWithdrawalResolved")){r.Defend(a,S.leftSeat,0,.4);return;}
    const yaowa=r.companion.Handle("yaowa");
    if(!this.zhouEscortDispatched){this.zhouEscortDispatched=true;this.SetWalk(yaowa,S.leftRoute.slice(-3));}
    if(!this.walks.has(a.id)){
      if(yaowa?.alive&&Distance(yaowa.position,a.position)>B.rearArrivalM)return;
      const he=r.companion.Handle("heyoutian");
      if(he?.alive&&Distance(he.position,S.leftSeat)>B.handoverReadyM)return;
      r.emplacement.NpcVacate(r.leftGunId,"woundedWithdrawal");
      // FRONT_SORTIE.zhouExit from the corner nearest to where he stands, over a clear first leg (Opening's helper).
      const route=[...ZhouGunExitRoute(a.position),P.collection.zhouWall];
      this.SetWalk(a,route);this.SetWalk(yaowa,route);
    }
    // Contract §2.6: 03 ends once Zhou is 10 m off the gun (He has it); reaching the collection is a 05 condition.
    if(!r.Has("zhouLeftGun")&&Distance(a.position,S.leftSeat)>=B.zhouLeftGunM)r.Record("zhouLeftGun",{distance:+Distance(a.position,S.leftSeat).toFixed(1)});
    if(this.Walk(a,{speed:R.walkSpeedMps})){
      Object.assign(r.column.zhou,{x:a.position.x,z:a.position.z,health:a.health,visible:true,state:"waiting"});
      r.Record("zhouGunWounded",{priorWound:true,x:a.position.x,z:a.position.z});r.ai.Remove(a);this.SetWalk(yaowa,[{x:-33,z:-100}]);
    }
  }
  RoadDistance(index){return MissionRouteLength(S.road.slice(0,index+1));}
  MoveTank(dt){
    const r=this.r,t=r.tank,stage=r.flow.stage.id;
    // 04 and 05 both stop at Block (Squeeze is reserved; the brain path, which replaced this mover, never goes there either).
    let limit=this.RoadDistance(stage==="Support"?S.tankPreviewIndex:S.tankBlockIndex);
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
  /** Relief roster: the NCO who receives the batch in the safe zone (he speaks FrontRelief), the gunner for the left gun, the gap-junction holder. */
  ReliefRoster(){
    return [
      {post:B.reliefLeadPost,weapon:"HanYang",speaking:true,route:[...MISSION_FRONT_COLLECTION_ROUTE,...S.approach.slice(1,4),B.reliefLeadPost]},
      {post:P.reliefPositions[0],weapon:"Zb26",gun:true,route:[...MISSION_FRONT_COLLECTION_ROUTE,...S.leftRoute.slice(1,-1),ReliefGunStandby()]},
      // Down the support sap to the gap junction (the old straight line from SJ cut through the sap walls).
      {post:P.reliefPositions[1],weapon:"HanYang",route:[...MISSION_FRONT_COLLECTION_ROUTE,...S.approach.slice(1,8),P.reliefPositions[1]]},
    ];
  }
  UpdateRelief(dt){
    const r=this.r,stage=r.flow.stage.id;
    if(!["Tank","Orders"].includes(stage))return;
    // Contract §2.6: the relief comes up as soon as the tank is silenced, in parallel with the last batch and the pair's return.
    if(!r.relief&&(stage==="Orders"||r.Has(TankClearFact(r.tank)))){
      // Built once here (the roster used to be rebuilt every frame for a length check).
      r.relief=this.ReliefRoster().map((spec,i)=>{
        const actor=r.ai.Spawn("nra",A.collection.x+i*1.5,A.collection.z,{weapon:spec.weapon,squadId:"MissionRelief",...(spec.speaking?SpeakingCastOptions("relief"):{})});
        if(!actor)return null;InstallMissionSentry(actor);actor.missionId=`Relief${i}`;
        this.SetWalk(actor,spec.route);
        return {actor,gun:!!spec.gun,speaking:!!spec.speaking,arrived:false,index:0,distance:0,delay:0,route:this.walks.get(actor.id).route};
      }).filter(Boolean);
    }
    if(!r.relief)return;
    for(const e of r.relief){e.arrived=this.Walk(e.actor);e.index=this.walks.get(e.actor.id)?.index||0;}
    // Every live man of the relief is on his post (a spawn that failed or a man killed on the way does not hang 05).
    if(r.relief.every(e=>!e.actor.alive||e.arrived)){
      r.Record("reliefInPosition");
      if(!this.postsRelieved){
        this.postsRelieved=true;r.emplacement.NpcVacate(r.leftGunId,"relief");
        // He leaves the gun down the access trench to the safe zone, Liu steps over from the trench mouth: both
        // meet the returning pair there (FRONT_SPACE.returnMeet), then walk home with them.
        this.SetWalk(r.companion.Handle("heyoutian"),[...S.leftRoute].reverse().slice(0,4).concat([B.heMeetPost]));
        this.SetWalk(r.companion.Handle("liuwencai"),[B.liuMeetPost]);
        // He has vacated the seat: the relief gunner takes the last reliefGunStandbyM into it (B.reliefGunStandbyM).
        const gunner=r.relief.find(e=>e.gun)?.actor;if(gunner){r.emplacement.NpcOccupy(r.leftGunId,gunner);this.SetWalk(gunner,[S.leftSeat]);}
      }
    }
    this.UpdateReturnMeet();
    if(this.postsRelieved&&stage==="Orders")for(const id of ["heyoutian","liuwencai"])this.Walk(r.companion.Handle(id));
  }
  /** 05->06 return beat in the safe zone (FRONT_SPACE.returnMeet): Liu reports the batch through, the relief NCO takes over, Luo sends everyone home. */
  UpdateReturnMeet(){
    const r=this.r;
    if(r.voice.played.has("FrontRelief")){
      if(this.postsRelieved&&!this.homeSent&&r.voice.finished.has("FrontRelief")){
        this.homeSent=true;
        const home=[S.approach[3],S.approach[2],S.approach[1],...[...MISSION_FRONT_COLLECTION_ROUTE].reverse()];
        for(const id of ["heyoutian","liuwencai"])this.SetWalk(r.companion.Handle(id),home);
      }
      return;
    }
    if(r.flow.stage.id!=="Tank"||!r.Has("lastGuardsWithdrawn")||!r.relief)return;
    const lead=r.relief.find(e=>e.speaking);
    const ready=!lead?.actor?.alive||lead.arrived;
    const back=Routes.orders.slice(S.attackRoute.length-1);
    const passed=MissionRouteProjection(back,r.player.position).progress>MissionRouteProjection(back,Space.returnMeet).progress+Space.returnMeet.radiusM;
    if(ready&&(r.Near(Space.returnMeet,Space.returnMeet.radiusM)||passed)){r.Record("returnMet",{passed});r.Say("FrontRelief");}
  }
  Guide(){
    const r=this.r;if(!this.Active)return null;
    const stage=r.flow.stage.id;
    // Brief item 5: while the tank shows itself (03 preview) and until it has shelled the nest (04), the guide points
    // at the tank, not at the gap - the new threat is what the player has to read.
    // The marker stands beside the tank on the ground (B.guideTankLeadM toward the player, B.guideTankSideM to his
    // right of it), so the diamond and its label do not cover the turret.
    let tank=null;
    if(r.tank?.present){
      const dx=r.player.position.x-r.tank.x,dz=r.player.position.z-r.tank.z,d=Math.hypot(dx,dz);
      if(d>(B.guideTankLeadM+B.guideTankSideM)*2){const ux=dx/d,uz=dz/d;
        // Facing the tank the player looks along -u; his right hand is (uz,-ux) in this X-east / Z-south world.
        tank={x:r.tank.x+ux*B.guideTankLeadM+uz*B.guideTankSideM,z:r.tank.z+uz*B.guideTankLeadM-ux*B.guideTankSideM};}
      else tank={x:r.tank.x,z:r.tank.z};
    }
    if(stage==="Support"){
      if(!r.Has("rightNestCaptured"))return {target:MissionRouteLookahead(Routes.support,r.player.position),label:"support",objective:Objectives.capture};
      return tank&&r.Has("tankPreviewed")?{target:tank,label:"tank",objective:Objectives.coverFirst}:{target:S.gap,label:"front",objective:Objectives.coverFirst};
    }
    if(stage==="MachineGun"){
      if(r.Has("tankPositionPressured"))return {target:MissionRouteLookahead(S.rearRoute,r.player.position),label:"bundle",objective:Objectives.rear};
      return tank?{target:tank,label:"tank",objective:Objectives.coverRest}:{target:S.gap,label:"front",objective:Objectives.coverRest};
    }
    const labels={supply:"bundle",return:"bundle",attack:"throw",retreat:"front",gapWatch:"front",disengage:"orders",home:"orders"};
    return {target:!r.Has("bundleTaken")&&r.Near(S.house,S.supplierRangeM)?A.bundle:MissionRouteLookahead(this.leaderRoute||Routes.bundle,r.player.position),label:labels[this.leg]||"bundle",objective:Objectives[{gapWatch:"retreat",home:"disengage"}[this.leg]||this.leg]||Objectives.supply};
  }
  State(){return {leg:this.leg,blocked:this.blocked,gapWatched:!!this.gapWatched,returnMeetDone:!!this.returnMeetDone,handoverStarted:!!this.handoverStarted,roadProgress:this.r.tank.roadProgress||0,walks:[...this.walks].map(([id,w])=>({id,index:w.index,total:w.route.length})),stalls:this.stalls.slice()};}
}
