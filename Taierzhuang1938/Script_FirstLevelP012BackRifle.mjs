// P012-only use of the supplied BackRifleRun. Original cast, weapons and combat clips stay owned by Actor.
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
let libraryPromise;
export function LoadP012BackRifle() {
  return libraryPromise ||= Promise.all([
    new GLTFLoader().loadAsync("./Animation/BackRifleRun/Animation_LugouNraBackRifleRun.glb?v=20260905NaturalRunV2"),
    fetch("./Animation/BackRifleRun/Data_BackRifleRun.json?v=20260905NaturalRunV2").then(response=>response.json()),
  ]);
}
export async function InstallP012BackRifle(soldier) {
  const actor=soldier.actor,rig=actor?.characterRig;
  if(!rig?.modelId?.startsWith("LugouNra")||rig.p012BackRifleInstalled)return;
  rig.p012BackRifleInstalled=true;
  const [source,config]=await LoadP012BackRifle();if(rig.disposed)return;
  const clip=source.animations.find(clip=>clip.name==="BackRifleRun").clone();
  // Bind-space translation differences between NRA variants must not shift the body.
  clip.tracks=clip.tracks.filter(track=>{
    const [name,property]=track.name.split("."),from=source.scene.getObjectByName(name),to=rig.asset.gltf.scene.getObjectByName(name);
    if(!from||!to)return false;
    if(property==="position")for(let i=0;i<track.values.length;i+=3){track.values[i]+=to.position.x-from.position.x;track.values[i+1]+=to.position.y-from.position.y;track.values[i+2]+=to.position.z-from.position.z;}
    return true;
  });
  rig.clipById.set("BackRifleRun",clip);
  rig.p012BackRifleReferenceMps=config.referenceSpeedMps;
  const sourceMount=source.scene.getObjectByName("Socket_BackRifle"),mount=sourceMount.clone(false);
  mount.name="P012BackRifleMount";rig.bones.chest.add(mount);
  const sling=sourceMount.getObjectByName("Model_BackRifleSling").clone();mount.add(sling);sling.visible=false;
  const select=rig._ActionForState;
  rig._ActionForState=function SelectP012BackRifle(state={}){
    const id=select.call(this,state);
    const allowed=soldier.p012BackRifle&&!soldier.p012AwaitingWeapon&&!soldier.scriptDefensive
      &&!this.forcedClip&&!state.firing&&!state.carryRole&&!state.meleeCombat
      &&!(state.dead>0||state.crouch>.35||state.prone>.35||state.throwing>.08||state.reach>.08||state.binoculars>.08)
      &&id==="RifleRun";
    this.p012BackRifleActive=!!allowed;
    return allowed?"BackRifleRun":id;
  };
  const update=actor.Update;let mounted=false;
  actor.Update=function UpdateP012BackRifle(dt,state={}){
    const result=update.call(this,dt,state),active=rig.p012BackRifleActive&&!!this.weaponGroup;
    if(active){
      if(this.weaponGroup.parent!==mount)mount.add(this.weaponGroup);
      this.weaponGroup.position.set(0,0,0);this.weaponGroup.rotation.set(-Math.PI/2,0,0);
      this.weaponGroup.scale.setScalar(this._SocketScaleCompensation(mount));this.weaponGroup.visible=true;
      mounted=true;
    }else if(mounted&&this.weaponGroup){this._MountRiggedWeapon(this.weaponGroup);this._UpdateRiggedWeaponMount();mounted=false;}
    sling.visible=!!active;return result;
  };
}
