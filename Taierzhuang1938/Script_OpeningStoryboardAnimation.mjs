import { CutscenePerformer } from "./Script_CutscenePerformance.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
let library, pending;
export function LoadOpeningStoryboardAnimation(){
  return pending ||= (async()=>{
    const Read=async(file)=>{const response=await fetch(C.animationBase+file+"?v="+C.version);if(!response.ok)throw Error(`Opening animation ${file}: ${response.status}`);return response.json();};
    const config=await Read("Data_OpeningStoryboardsAnimation.json");
    const models=new Map(await Promise.all(config.models.map(async row=>[row.id,await Read(row.file)])));
    return library={config,models};
  })();
}
export function InstallOpeningStoryboardAnimation(soldier){
  const actor=soldier?.actor,rig=actor?.characterRig;
  if(!rig||rig.openingStoryboardInstalled)return;
  rig.openingStoryboardInstalled=true;
  const original=actor.Update;
  let performer,lastPose,transitionAt=0,previous;
  actor.Update=function(dt,state){
    performer?.Restore();
    if(soldier.openingStoryboardTravel!=null)state={...state,moveSpeed:soldier.openingStoryboardTravel/4.2};
    const result=original.call(this,dt,state);
    const pose=soldier.openingStoryboardPose,record=library?.models.get(rig.modelId);
    if(rig.openingSlungRifle)rig.openingSlungRifle.visible=false;
    if(!pose||!record){if(rig.openingSlungRifle&&actor.weaponGroup)actor.weaponGroup.visible=true;rig.openingStoryboardState=null;lastPose=null;return result;}
    performer ||= new CutscenePerformer(actor,record,library.config);
    if(lastPose?.clip!==pose.clip){transitionAt=pose.seconds;previous=lastPose?{clipId:lastPose.clip,t0:transitionAt,phase:lastPose.seconds,speed:0}:null;}
    performer.Apply({clipId:pose.clip,t0:transitionAt,phase:transitionAt,speed:0,previous},pose.seconds);
    lastPose={...pose};
    if(actor.weaponGroup){
      const slung=pose.clip==="InterrogateCrouch";
      actor.weaponGroup.visible=!slung;
      if(slung&&!rig.openingSlungRifle){
        const prop=rig.openingSlungRifle=actor.weaponGroup.clone();
        actor.root.add(prop);
        prop.scale.setScalar(actor.weaponScale);
      }
      if(rig.openingSlungRifle){
        const prop=rig.openingSlungRifle;prop.visible=slung;
        if(slung){rig.bones.chest.getWorldPosition(prop.position);actor.root.worldToLocal(prop.position);prop.position.x-=.23;prop.position.z+=.18;prop.rotation.set(Math.PI/2,0,-.12,"YXZ");}
      }
    }
    rig.openingStoryboardState={...performer.state};
    return result;
  };
}
