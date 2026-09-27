// Five Blender-authored clips on the shared NRA rig. One library for the first-level cast.
import { AnimationClip, Object3D, Vector3, Quaternion } from 'three';
import { ALLY_GAIT as C } from './Data_Tuning_AllyGait.mjs';
import { AllyGaitThreat, SelectAllyGait } from './Script_AllyGaitPolicy.mjs';
let promise;
export function LoadAllyGait() {
  return promise ||= fetch(`./Animation/AllyGait/Animation_TengxianAllyGait.json?v=${C.version}`)
    .then(r => { if (!r.ok) throw new Error('AllyGait HTTP '+r.status); return r.json(); });
}
export async function InstallAllyGait(soldier) {
  const actor=soldier?.actor, rig=actor?.characterRig;
  if (!rig?.modelId?.startsWith('TengxianNra') || rig.allyGaitInstalled) return;
  const data=await LoadAllyGait();
  if (rig.disposed || rig.allyGaitInstalled) return;
  rig.allyGaitInstalled=true;
  const helper=new Object3D();helper.name='AllyRifle';rig.root.add(helper);
  const propTracks=new Map();
  for (const json of data.clips) {
    const clip=AnimationClip.parse(json);
    propTracks.set(clip.name,clip.tracks.filter(t=>t.name.startsWith('AllyRifle.')).map(t=>({property:t.name.split('.')[1],sample:t.createInterpolant()})));
    clip.tracks=clip.tracks.filter(t=>!t.name.startsWith('AllyRifle.'));
    rig.clipById.set(clip.name,clip);
  }
  rig.locomotion.profiles={...rig.locomotion.profiles,
    ...Object.fromEntries(Object.entries(data.profiles).filter(([,p])=>p.referenceMps>0))};
  let readySeconds=0;
  const select=rig._ActionForState,update=rig.Update;
  rig._ActionForState=function SelectAllyLocomotion(state={}) {
    const id=select.call(this,state);
    if (this.forcedClip || actor.ragdollState || !this.CanPlayInfantry()) return id;
    const chosen=SelectAllyGait(soldier,state,id,readySeconds);
    if (chosen.startsWith('Ally')) this.p012BackRifleActive=false;
    return chosen;
  };
  rig.Update=function UpdateAllyLocomotion(dt,state={}) {
    readySeconds=AllyGaitThreat(soldier,state)?C.readyHoldS:Math.max(0,readySeconds-Math.max(0,dt));
    return update.call(this,dt,state);
  };
  const point=new Vector3(),rotation=new Quaternion();
  const props=actor._UpdateInfantryProps,aim=actor._ApplyRiggedAim;
  actor._UpdateInfantryProps=function UpdateAllyRifle() {
    props.call(this);
    let total=0;
    for (const [id,tracks] of propTracks) {
      if (!tracks.length) continue;
      const action=rig.mixer.existingAction(rig.clipById.get(id));
      const weight=action?.isScheduled()?action.getEffectiveWeight():0;
      if (!(weight>0)) continue;
      const alpha=weight/(total+weight);
      for(const track of tracks) {
        const value=track.sample.evaluate(action.time);
        if(track.property==='position'){point.fromArray(value);if(!total)helper.position.copy(point);else helper.position.lerp(point,alpha);}
        else{rotation.fromArray(value);if(!total)helper.quaternion.copy(rotation);else helper.quaternion.slerp(rotation,alpha);}
      }
      total+=weight;
    }
    rig.allyCarryWeight=Math.min(1,total);
    // Speech/hit layers may move the shoulder after the baked pose was sampled.
    // Keep the rifle in the actual palm, including during carry/ready crossfades.
    if(total>0){rig.Grip('weaponR').getWorldPosition(point);helper.position.copy(rig.root.worldToLocal(point));}
    if (total>0 && !this.goreWeaponHold) this._ApplyInfantryProp(this.weaponGroup,helper,rig.allyCarryWeight);
  };
  actor._ApplyRiggedAim=function AimAllyRifle(state) {
    // Carry clips release the left arm; the inherited AI aim value must not raise it again.
    if (rig.currentId.includes('Carry') && rig.currentId.startsWith('Ally') && !state.firing) {
      rig.speakerGesture?.AfterActorAim();
      return;
    }
    return aim.call(this,state);
  };
}
