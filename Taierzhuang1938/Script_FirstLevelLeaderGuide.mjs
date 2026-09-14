import * as THREE from "three";
import { NpcMissionGuide,GuideProjection } from "./Script_NpcMissionGuide.mjs";
import { MISSION_GUIDE_TUNING as G } from "./Data_Tuning_MissionGuide.mjs";
import { MISSION_LEADER_STAGES, MISSION_GUIDE_TRANSFERS } from "./Data_FirstLevelLeaderGuide.mjs";
import { MISSION_ANCHORS as A, MISSION_SUPPLIES } from "./Data_FirstLevelMissionLayout.mjs";
import { Localize, T } from "./Script_Text.mjs";
import { FirstLevelStageTextId } from "./Script_TextIds.mjs";
import { InstallNpcGuideGesture } from "./Script_NpcGuideGesture.mjs";
import { SQUAD_MARCH } from "./Data_Tuning_SquadMarch.mjs";
const Distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
export class FirstLevelLeaderGuide {
  constructor(runtime) {
    this.r = runtime; this.rule = new NpcMissionGuide(G); this.projected = new THREE.Vector3();
    this.stage = null; this.nextVoiceAt = 0; this.lastStoryAt = -Infinity; this.orders = [];
    this.Project = point => {
      const camera = this.r.camera, p = this.projected;
      p.set(point.x,point.y,point.z).applyMatrix4(camera.matrixWorldInverse);
      const behind = p.z >= 0;
      p.set(point.x,point.y,point.z).project(camera);
      return {x:(p.x*.5+.5)*window.innerWidth,y:(-p.y*.5+.5)*window.innerHeight,behind,
        visible:!behind&&p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};
    };
  }
  get Leader() { return this.r.squad?.[G.leaderIndex]; }
  Enter(stage) {
    this.stage = stage.id; this.variant = null; this.firstOrder = true;
    this.nextVoiceAt = this.r.time + (MISSION_LEADER_STAGES[stage.id]?.story ? G.storyOrderDelayS : G.initialOrderS);
    this.r.voice.CancelGuidance(); this.waitSince = null;
    if(this.Leader) { this.Leader.missionGuideWaiting = false; this.Leader.missionGuideGesture = 0; }
  }
  Plan(route) {
    const actor = this.Leader, r = this.r;
    if (!actor || !MISSION_LEADER_STAGES[r.flow.stage.id]) return;
    // Alternating cover already defines every rendezvous and its pair-release
    // dependency. An extra wait between two shelters would deadlock that gate.
    if(r.squadCoverBounds){
      this.rule.Reset([{x:actor.position.x,z:actor.position.z},...route]);
      this.waitSince=null;return;
    }
    if(MISSION_LEADER_STAGES[r.flow.stage.id].rejoinRoute&&!r.squadCoverBounds){
      const join=GuideProjection(route,actor.position),point=join.point;
      if(point&&join.nextIndex>0&&join.distance<=G.routeJoinM
        &&Math.abs(r.battlefield.GroundHeight(point.x,point.z)-actor.position.y)<=G.groundDeltaM
        &&!r.BlocksSight(r.Point(actor.position,.8),r.Point(point,.8))){
        const dx=point.x-actor.position.x,dz=point.z-actor.position.z;
        const swept=actor.body?.ProbeMove(dx,G.routeJoinProbeY,dz);
        if(swept&&Math.hypot(swept.x-dx,swept.z-dz)<=G.routeJoinToleranceM)route.splice(0,join.nextIndex,point);
      }
    }
    const planned = [];
    const capacity=Math.max(0,SQUAD_MARCH.maxRoutePoints-route.length);
    let distance = 0, previous = actor.position, index = 0;
    for (let i=0;i<route.length;i++) {
      const point = route[i], before = route[i-1] || actor.position;
      distance += Distance(previous,point); previous = point;
      // Authored trench shelter gates already own exact placement and release.
      if(index<capacity&&!Number.isInteger(point.coverBound) && !point.coverTransit && distance>=G.stopSpacingM) {
        const dx=point.x-before.x,dz=point.z-before.z,length=Math.hypot(dx,dz)||1;
        for(const side of [1,-1]) {
          const stop={x:point.x+dz/length*G.stopOffsetM*side,z:point.z-dx/length*G.stopOffsetM*side};
          const ground=r.battlefield.GroundHeight(stop.x,stop.z);
          if(!r.ai.ctx?.nav?.Walkable(stop.x,stop.z)
            || Math.abs(ground-r.battlefield.GroundHeight(point.x,point.z))>G.groundDeltaM
            || r.physics.Overlaps(stop.x,ground+.04,stop.z,G.capsuleM,1.78)
            || r.BlocksSight(r.Point(point,.8),r.Point(stop,.8)))continue;
          stop.guideCheckpoint=index++;
          planned.push(stop); distance=0; break;
        }
      }
      planned.push(point);
    }
    // Keep the actor's approach and the exact terminal defensive post.
    route.splice(0,route.length,...planned);
    this.rule.Reset([{x:actor.position.x,z:actor.position.z},...route]);
    this.waitSince=null;
  }
  BeginSquad() {
    const actor=this.Leader;
    if(actor){InstallNpcGuideGesture(actor);actor.missionGuideWaiting=false;actor.missionGuideGesture=0;}
  }
  Hold(actor,point) {
    if(actor!==this.Leader || point.guideCheckpoint==null)return false;
    const r=this.r;
    if(this.rule.CanLeave(point,r.player.position,!r.BlocksSight(r.player.EyePosition,r.Point(actor.position,1.3))))return false;
    r.squadMarch?.Release(actor);
    const danger=actor.targetVisible||actor.suppression>G.threatSuppression;
    if(danger)r.Defend(actor,point);else r.Defend(actor,point,0,0);
    actor.missionGuideWaiting=true;
    if(!danger)r.ai.SetStance(actor,0,G.watchHoldS,true);
    this.Watch(actor);return true;
  }
  Watch(actor) {
    const r=this.r;
    if(actor.targetVisible || actor.suppression>G.threatSuppression || actor.missionGrenadeEvade)return;
    actor.watchYaw=Math.atan2(actor.position.x-r.player.position.x,actor.position.z-r.player.position.z);
    actor.watchUntil=r.ai.time+G.watchHoldS;
    actor.missionGuideGesture=(r.time%G.gesturePeriodS)<G.gestureSeconds?1:0;
  }
  AtPost(actor) {
    if(actor!==this.Leader || !MISSION_LEADER_STAGES[this.stage])return false;
    this.r.Defend(actor,actor.holdZone||actor.position);
    if(!actor.targetVisible){actor.missionGuideWaiting=true;this.Watch(actor);}
    return true;
  }
  View() {
    const r=this.r, actor=this.Leader, spec=MISSION_LEADER_STAGES[r.flow.stage.id];
    if(!spec||!actor?.alive||r.failed||r.completed||r.controls||!r.player.alive
      || (r.flow.stage.id==="Unloading"&&!r.Has("luoRescueComplete")))return null;
    let {mode,cue,target}=spec, label=mode, variant=r.flow.stage.id;
    if(variant==="Support"&&r.Has("frontReached"))mode=label="cover";
    if(variant==="Tank"&&r.Inventory().bundles>0){target=A.throw;cue="GuideThrow";mode=label="throw";variant+="Throw";}
    if(variant==="MachineGun"){
      const gun=r.emplacement.Emplacement(r.gunId);
      if(gun?.rounds===0&&gun.belts===0){
        target=MISSION_SUPPLIES.find(supply=>supply.id==="Front");
        mode=label="collect";cue="GuideGunSupply";variant+="Supply";
      }else if(r.emplacement.Mounted){mode=label="cover";cue=null;}
    }
    if(variant==="Courtyard") {
      if(r.Has("villageGunSilent")){target=A.gate;mode=label="open";}
      if(r.Has("courtyardGateOpen")&&r.Has("villageGunSilent")){target=A.courtCover;mode=label="cover";cue="GuideCourtCover";variant+="Cover";}
    }
    if(variant==="Transfer") {
      const id=r.transferBeats?.started.findLast(id=>!r.transferBeats.cleared.includes(id));
      if(id&&MISSION_GUIDE_TRANSFERS[id]){({cue,target}=MISSION_GUIDE_TRANSFERS[id]);variant+=id;}
    }
    if(["Carry","FinalCarry"].includes(r.flow.stage.id)) {
      if(r.carry.Active){target=r.flow.stage.id==="Carry"?A.ditchMouth:A.zhouDrop;mode=label=r.flow.stage.id==="Carry"?"move":"place";}
      else {const z=r.column.zhou;target={x:z.x+Math.sin(z.yaw)*1.6,z:z.z+Math.cos(z.yaw)*1.6};}
    }
    if(mode==="follow"||mode==="rally") {
      target=actor.position;
      label=actor.missionGuideWaiting||actor.missionCoverWaiting?"rally":"follow";
    }
    target??=actor.position;
    const leaderTarget=target===actor.position;
    return {mode,label,variant,cue,leaderTarget,waiting:!!(actor.missionGuideWaiting||actor.missionCoverWaiting),
      target:{x:target.x,y:(leaderTarget?actor.position.y:r.battlefield.GroundHeight(target.x,target.z))+(leaderTarget?G.markerHeightM:1.15),z:target.z},
      name:leaderTarget?T("gameplay.cast.luo"):T(`firstLevel.leader.${label}`),
      action:T(`firstLevel.leader.${label}`),distance:Distance(r.player.position,target),
      objective:Localize(FirstLevelStageTextId(r.flow.stage.id),r.flow.stage.objective)};
  }
  Update() {
    const r=this.r,view=this.View();this.view=view;
    r.hud.SetMissionGuide?.(view,{Project:this.Project,player:r.player});
    if(!view)return;
    const busy=r.voice.current&&!r.voice.current.cue.guidance || r.voice.queue.some(id=>!id.startsWith("Guide"));
    if(busy)this.lastStoryAt=r.time;
    if(view.waiting)this.waitSince??=r.time;else this.waitSince=null;
    if(this.variant!==view.variant){
      if(this.variant!=null){r.voice.CancelGuidance();this.nextVoiceAt=Math.min(this.nextVoiceAt,r.time+G.initialOrderS);this.firstOrder=true;}
      this.variant=view.variant;
    }
    if(busy||r.voice.current||r.time-this.lastStoryAt<G.quietAfterStoryS)return;
    const waiting=view.leaderTarget&&this.waitSince!=null&&r.time-this.waitSince>=G.waitReminderS;
    if(r.time<this.nextVoiceAt || Distance(this.Leader.position,r.player.position)>G.voiceRangeM)return;
    const cue=waiting&&!this.firstOrder?"GuideWait":view.cue;
    if(r.voice.Guidance(cue)) {
      this.orders.push({cue,stage:this.stage,time:r.time});if(this.orders.length>96)this.orders.shift();
      this.nextVoiceAt=r.time+(this.firstOrder?G.reminderS:G.repeatS);this.firstOrder=false;
    }
  }
  Objective() { return this.View()?.objective || ""; }
  State() { return {stage:this.stage,...this.rule.Snapshot(),view:this.view,orders:[...this.orders]}; }
  Dispose() { this.r.voice.CancelGuidance();this.r.hud.SetMissionGuide?.(null);if(this.Leader){this.Leader.actor?.npcGuideGesture?.Restore();delete this.Leader.missionGuideGesture;delete this.Leader.missionGuideWaiting;} }
}
