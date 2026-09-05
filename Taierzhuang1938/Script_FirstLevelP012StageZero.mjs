// P012 render/physics adapters only. Story and finite lifecycles remain in the
// pure Arrival/VillageLife controllers. ShellShot alone briefly captures the live camera.
import * as THREE from "three";
import { FirstLevelP012Guidance } from "./Script_FirstLevelP012Guidance.mjs";
import { FirstLevelP012ShellShot } from "./Script_FirstLevelP012ShellShot.mjs";
import { HashString } from "./Script_Noise.mjs";
import { FirstLevelP012Arrival } from "./Script_FirstLevelP012Arrival.mjs";
import { FirstLevelP012ArrivalView } from "./Script_FirstLevelP012ArrivalView.mjs";
import { FirstLevelP012VillageLife } from "./Script_FirstLevelP012VillageLife.mjs";
import { FirstLevelP012VillageLifeView } from "./Script_FirstLevelP012VillageLifeView.mjs";
import { InstallP012VillagePose, P012VillageWorkerTargets } from "./Script_FirstLevelP012VillagePose.mjs";
import { P012SegmentClear } from "./Script_FirstLevelP012March.mjs";

export class FirstLevelP012StageZero {
  constructor(host) {
    this.host = host; this.elapsed = 0; this.people = new Set();
    this.shellShot=new FirstLevelP012ShellShot(host);
    this.guidance=new FirstLevelP012Guidance(host);
    this.arrivalView = new FirstLevelP012ArrivalView();
    this.villageView = new FirstLevelP012VillageLifeView(host.scene, (x,z)=>host.battlefield.GroundHeight(x,z));
    this.arrival = new FirstLevelP012Arrival({
      // Flow's real Luo is held at trainRoute[1] until this door fact releases him.
      NearDoor: () => { const actor=host.Guide(), at=host.config.activities.trainRoute[1];
        return !!actor?.alive && Math.hypot(actor.position.x-at.x,actor.position.z-at.z)<.6; },
      SetDoorProgress: progress => {
        for(const [id,gate] of host.battlefield.gates) if(gate.spec.signal==="P012TrainDoor") host.battlefield.SetGateProgress(id,progress);
      },
      ReleaseColumn: () => host.Signal("P012TrainDoor"),
      Subtitle: text => {const [speaker,...words]=text.split("：");host.hud.Say(speaker,words.join("："),4);},
      StartAudio: cue => { const previous=host.audio.ambiencePreset; host.audio.Ambience(cue); return {cue,previous}; },
      StopAudio: handle => { if(host.audio.ambiencePreset===handle.cue)host.audio.Ambience(handle.previous||host.ambience); },
      PlaySfx: cue => host.audio.Play(cue,{volume:.55,position:host.Guide()?.position}),
      RenderArrival: view => {
        this.arrivalView.Render(view);
        this.UpdateTrain(view);
        if(view.steam>0&&!this.steam) this.steam=host.vfx.SmokeSource(new THREE.Vector3(-66,5,86+(view.trainOffsetM||0)),
          {kind:"screen",rate:5,radius:.3,rise:1.2,sizeStart:.45,sizeEnd:2.8,life:3,opacity:.15});
        if(view.steam===0&&this.steam){host.vfx.RemoveSmokeSource(this.steam);this.steam=null;}
      },
    });
    this.village = new FirstLevelP012VillageLife({
      Spawn: spec => {
        const actor=host.actorFactory.Create(spec.kind,{seed:HashString(spec.id),weapon:null,modelVariant:spec.role==="wounded"?0:1});
        actor.root.name=spec.id;
        actor.root.position.set(spec.x,host.battlefield.GroundHeight(spec.x,spec.z),spec.z); actor.root.rotation.y=spec.yaw;
        host.scene.add(actor.root);
        const entry={id:spec.id,actor,position:actor.root.position,role:spec.role};
        if(spec.role==="telephone"||spec.role==="worker") entry.body=host.physics.MakeCharacter({radius:spec.role==="worker"?spec.bodyRadius:.34,height:1.78,position:entry.position});
        if(spec.role==="worker")entry.workPose=InstallP012VillagePose(actor);
        this.people.add(entry); return entry;
      },
      Position: entry => entry?.position,
      WorkerWork:(spec,door)=>P012VillageWorkerTargets(spec,door,(x,z)=>host.battlefield.GroundHeight(x,z)),
      Move: (entry,target,speed,dt) => {
        const dx=target.x-entry.position.x,dz=target.z-entry.position.z,distance=Math.hypot(dx,dz),scale=distance?Math.min(1,speed*dt/distance):0;
        if(entry.body){const at=entry.body.Move(dx*scale,-9.8*dt,dz*scale);entry.position.set(at.x,at.y,at.z);}
        return entry.position;
      },
      Pose: (entry,pose,dt) => {
        entry.actor.root.rotation.y=pose.yaw;
        entry.workPose?.SetTargets(pose.workTargets);
        entry.actor.Update(dt,{...pose,moveSpeed:pose.moveSpeed/3.05,elapsed:this.elapsed,prone:0,dead:0,carrying:0});
      },
      MoveProp: (from,to,radius,{fromYaw,toYaw}) => {
        // Translation AND rotation arcs: a cart tail can hit a wall while its nose is stationary.
        const bodies=[host.Player()?.position,host.Guide()?.position,...host.runtime.traffic.filter(entry=>!entry.retired).map(entry=>entry.actor?.position),...[...this.people].map(entry=>entry.position)].filter(Boolean);
        for(const offset of [0,1.1,2.2])for(const body of bodies){
          const before=Math.hypot(body.x-from.x-Math.sin(fromYaw)*offset,body.z-from.z-Math.cos(fromYaw)*offset);
          const after=Math.hypot(body.x-to.x-Math.sin(toYaw)*offset,body.z-to.z-Math.cos(toYaw)*offset);
          if(after<radius+.42&&after<before-1e-6)return {...from,yaw:fromYaw};
        }
        const delta=Math.atan2(Math.sin(toYaw-fromYaw),Math.cos(toYaw-fromYaw));
        const steps=Math.max(1,Math.ceil(Math.abs(delta)/.03));
        for(const offset of [0,1.1,2.2])for(let i=0;i<steps;i++) {
          const At=t=>({x:from.x+(to.x-from.x)*t+Math.sin(fromYaw+delta*t)*offset,
            z:from.z+(to.z-from.z)*t+Math.cos(fromYaw+delta*t)*offset});
          if(!P012SegmentClear(host.config.layout.blocks,At(i/steps),At((i+1)/steps),radius))return {...from,yaw:fromYaw};
        }
        return {...to,yaw:toYaw};
      },
      ExistingFamilyActor: (familyId,slot) => host.runtime.traffic.find(entry=>!entry.retired&&entry.familyId===familyId&&entry.slot===slot)?.actor,
      IsVisible: position => this.IsVisible(position), Signal:host.Signal,
      Remove: entry => {if(!entry)return;entry.workPose?.Dispose();entry.body?.Remove();entry.actor.root.removeFromParent();entry.actor.Dispose();this.people.delete(entry);},
    });
  }
  UpdateTrain(view) {
    if(this.disposed)return;
    const field=this.host.battlefield,offset=view.trainOffsetM||0,previous=field.trainOffsetM||0,delta=offset-previous;
    this.host.runtime.trainMoving=offset>0;
    for(const entry of this.host.runtime.trainColumn?.entries||[])entry.actor.p012OnMovingTrain=offset>0;
    const guide=this.host.Guide();if(guide){guide.p012OnMovingTrain=offset>0;if((this.host.runtime.beat||0)<5)guide.p012BackRifle=true;}
    if(Math.abs(delta)<1e-9)return;
    const player=this.host.Player(),actors=[this.host.Guide(),...(this.host.runtime.trainColumn?.entries||[]).map(entry=>entry.actor)];
    const passengers=[...(this.restoringPlayer?[]:[player]),...actors].filter(actor=>actor?.position&&field.TrainContains(actor.position,previous));
    field.SetTrainOffset(offset);
    for(const actor of passengers){
      actor.position.z+=delta;actor.body?.Teleport(actor.position.x,actor.position.y,actor.position.z);
      if(actor.goal)actor.goal.z+=delta;
      if(actor.actor)actor.actor.root.position.copy(actor.position);
    }
    if(passengers.includes(player))player.SyncCamera(0);
    if(this.steam?.position)this.steam.position.z=86+offset;
  }
  IsVisible(position) {
    if(!position)return false;
    const {camera,battlefield}=this.host;
    camera.updateWorldMatrix(true,false);
    const origin=camera.getWorldPosition(new THREE.Vector3());
    if(Math.hypot(position.x-origin.x,position.z-origin.z)>38)return false;
    return [.75,1.45].some(height=>{
      const point=new THREE.Vector3(position.x,battlefield.GroundHeight(position.x,position.z)+height,position.z),screen=point.clone().project(camera);
      if(screen.z < -1 || screen.z > 1 || Math.abs(screen.x)>.95 || Math.abs(screen.y)>.95)return false;
      const ray=point.sub(origin),distance=ray.length();if(distance<.1)return true;
      const hit=battlefield.Raycast(origin,ray.normalize(),distance);return !hit||hit.t>=distance-.08;
    });
  }
  Update(dt) {
    this.elapsed+=dt;
    if(!this.shellShot.active)this.shellShot.UpdateBarrage(dt);
    if(!this.trainInitialized){this.host.runtime.StepOpeningCast(0);this.trainInitialized=true;}
    this.arrival.Start();this.arrival.Update(dt);
    this.village.Start();this.village.Update(dt);this.villageView.Update(this.village.Snapshot());
    this.villageView.SyncColliders(this.host.physics);
    this.guidance.Update();
  }
  Snapshot() {
    const village=this.village.Snapshot();
    village.workerPoses=[...this.people].filter(entry=>entry.role==="worker").map(entry=>({id:entry.id,position:{x:entry.position.x,z:entry.position.z},pose:entry.workPose?.Snapshot()||null}));
    const approach={offset:this.host.battlefield.trainOffsetM,trainMoving:!!this.host.runtime.trainMoving};
    return {shellShot:this.shellShot.Snapshot(),arrival:{...this.arrival.Snapshot(),...this.arrival.View()},approach,village};
  }
  RestoreArrival(snapshot) {
    this.restoringPlayer=true;
    let view;try{view=this.arrival.Restore(snapshot);}finally{this.restoringPlayer=false;}
    if(view.canDisembark)this.host.Signal("P012TrainDoor");
  }
  Dispose() {
    this.disposed=true;this.shellShot.Dispose();this.guidance.Dispose();
    this.arrival.Dispose();this.arrivalView.Dispose();this.village.Dispose();this.villageView.Dispose();
    if(this.steam)this.host.vfx.RemoveSmokeSource(this.steam);this.steam=null;
  }
}
