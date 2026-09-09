import { MissionTrainLifePose } from "./Script_FirstLevelMissionTrainLife.mjs";
import { StandIdleLayer, StandIdleAllowed } from "./Script_ActorStandIdle.mjs";
import { STAND_IDLE } from "./Data_Tuning_ActorIdle.mjs";
// P012-only temporary cast identification; these are not historical uniform colours.
// Clone only the GLB uniform material (hands, heads, badges and mounted weapons
// use separate materials). No source asset, shared material or geometry is edited.
// Main opts in after the real companion roster is created. Actor disposal owns
// the private clones; textures remain asset-library owned and are never disposed.
export const P012_CAST_CLOTH_COLORS = Object.freeze({
  luo: 0xe8bd38,
  yaowa: 0x39bb85,
  zhaodegui: 0xb376dc,
  heyoutian: 0xe88136,
  liuwencai: 0x9ae2e2,
});
export const P012_UNIFORM_MATERIAL_NAME = "Material #1721585337";

// Opt-in for the opening recruits. Restore last sampled rotations
// before mixer evaluation, so the temporary FK never accumulates into a clip.
export function InstallP012OpeningPose(soldier) {
  const actor=soldier?.actor,rig=actor?.characterRig;
  if(!rig?.root||typeof rig.Update!=="function"||rig.p012OpeningPose)return false;
  const arms=["L","R"].map(side=>[rig.bones?.[`upperArm${side}`],rig.bones?.[`forearm${side}`],rig.bones?.[`hand${side}`]]);
  if(arms.some(chain=>chain.some(bone=>!bone)))return false;
  const original=rig.Update,saved=new Map(),lifePose=new MissionTrainLifePose(soldier);let time=0;
  rig.p012OpeningPose=true;
  rig.Update=function UpdateP012OpeningPose(dt,state={}) {
    lifePose.Restore();
    for(const [bone,rotation] of saved)bone.quaternion.copy(rotation);
    saved.clear();
    const result=original.call(this,dt,state);
    if(lifePose.Apply(dt,state))return result;
    lifePose.GroundReleasedPose(state,dt);
    const trainRest = soldier.missionTrainPassenger && !soldier.missionTrainReady && (state.moveSpeed ?? 0) < .025
      && !state.firing && !state.carryRole && !state.meleeCombat && !(state.prone > .35 || state.crouch > .35);
    if(!soldier.p012AwaitingWeapon && !trainRest)return result;
    time+=Math.max(0,dt);
    const basis=actor.root||rig.root,world=basis.getWorldQuaternion(basis.quaternion.clone());
    // Actor receives normalized speed (3.6 m/s = 1), not metres per second.
    const moving=Math.min(1,Math.max(0,Number(state.moveSpeed??0)*3.6/3.05));
    for(const [index,chain] of arms.entries())for(let joint=0;joint<2;joint++){
      const bone=chain[joint],child=chain[joint+1];saved.set(bone,bone.quaternion.clone());
      rig.root.updateWorldMatrix(true,true);
      const start=bone.getWorldPosition(bone.position.clone()),end=child.getWorldPosition(child.position.clone());
      const current=end.sub(start).normalize();
      // Use the shoulder's real actor-space side: GLB +Z is bridged to -Z,
      // so assuming L means +X tucked both forearms inside the torso.
      const side=basis.worldToLocal(start.clone()).x<0?-1:1;
      const desired=bone.position.clone().set(side*.23,-1,
        -.06+Math.sin(time*5+index*Math.PI)*.10*moving-(joint?.06:0)).normalize().applyQuaternion(world);
      const correction=bone.quaternion.clone().setFromUnitVectors(current,desired);
      const rotation=bone.getWorldQuaternion(bone.quaternion.clone()).premultiply(correction);
      const parent=bone.parent.getWorldQuaternion(bone.quaternion.clone()).invert();
      bone.quaternion.copy(parent.multiply(rotation));
    }
    rig.root.updateWorldMatrix(true,true);
    return result;
  };
  return true;
}

// P012 fallback while neutral walk/train idles are being authored. This adjusts
// playback only: AI movement, collision, route timings and source GLBs stay owned
// by their existing systems. In particular a slowed run is still not a walk.
//
// 【定格帧 + 待机叠加层】站住的人 rate 取 0（见下面两处 rate=0）：现有站姿素材是
// 「上前射击」和「挥臂下令」，原地循环等于全场原地踏步。但光定格会让整关的人站住
// 就变雕像 —— 定格之后由 Script_ActorStandIdle 在这一帧姿势上叠呼吸、重心倒换和
// 扫视，脚用 IK 钉在 clip 摆好的位置上。真正的中性待机 clip 到位后，这一层随
// rate=0 一起撤（需求见 docs/Data_FirstLevelP012AnimationNeeds.md）。
export function InstallP012ActorMotion(soldier) {
  const actor=soldier?.actor,rig=actor?.characterRig;
  if(!rig?.mixer||typeof rig._ActionForState!=="function"||rig.p012ActorMotion)return false;
  InstallP012OpeningPose(soldier);
  const original=rig.Update;
  const standIdle=new StandIdleLayer(soldier);
  let previous=null,lastElapsed=null,previousAction=null;
  const phase=((Number(soldier.id)||0)*.61803398875)%1;
  rig.p012ActorMotion=true;
  rig.p012BackRifleReady=import("./Script_FirstLevelP012BackRifle.mjs").then(module=>module.InstallP012BackRifle(soldier)).catch(error=>{rig.p012BackRifleError=String(error);console.warn("[P012BackRifle]",error);});
  rig.p012StandIdle=standIdle;
  rig.Update=function UpdateP012ActorMotion(dt,state={}) {
    // mixer 采样之前先撤掉上一帧的待机叠加，FK 不累积。
    standIdle.Restore();
    const at=actor.root.position;
    const elapsed=Number.isFinite(state.elapsed)?state.elapsed:null;
    const step=elapsed!==null&&lastElapsed!==null?elapsed-lastElapsed:dt;
    const distance=previous?Math.hypot(at.x-previous.x,at.z-previous.z):0;
    const measuredSpeed=previous&&step>0&&distance<Math.max(2,step*8)
      ? Math.min(6,distance/step):0;
    const speed=soldier.p012OnMovingTrain?0:measuredSpeed;
    this.p012ActualSpeedMps=speed;
    // Zero-dt pose reads (including stretcher sockets) must not consume motion.
    if(dt>0){previous={x:at.x,z:at.z};lastElapsed=elapsed;}
    if(this.forcedClip){this.currentAction?.setEffectiveTimeScale(1);return original.call(this,dt,state);}
    const next={...state,moveSpeed:dt>0?this.p012ActualSpeedMps/3.6:state.moveSpeed};
    const emptyIdle=(soldier.p012AwaitingWeapon || soldier.missionTrainPassenger && !soldier.missionTrainReady)&&next.moveSpeed<.025
      &&!state.firing&&!state.carryRole&&!(state.prone>.35||state.crouch>.35)
      &&!state.meleeCombat;
    // The command clip at 25% has both feet down and a near-upright torso.
    // The opening arm override lowers its gesture. It is a held placeholder,
    // not a new train-balancing animation. Mission passengers also use it while waiting.
    if(emptyIdle)next.reach=1;
    const id=this._ActionForState(next);
    this.Play(id,dt===0?0:.12);
    const action=this.currentAction;
    let rate=1;
    if(action){
      const changed=action!==previousAction;
      if(changed){
        previousAction?.stopWarping();action.stopWarping();
        if(!state.carryRole&&['RifleRun','AdvanceFire','WoundedLimp'].includes(id))
          action.time=action.getClip().duration*phase;
      }
      if(emptyIdle){action.time=action.getClip().duration*.25;rate=0;}
      else if(id==='CarryStretcherFront'||id==='CarryStretcherRear')rate=speed<.08?0:Math.min(1.6,speed/1.35);
      else if(id==='WoundedLimp')rate=Math.min(1.5,speed/1.1);
      else if(id==='RifleRun')rate=Math.min(1.6,speed/3.6);
      else if(id==='BackRifleRun')rate=speed/(this.p012BackRifleReferenceMps*actor.root.scale.y*this.root.scale.y);
      else if(id==='AdvanceFire'&&next.moveSpeed<.025&&!state.firing&&!(state.aim>.1)){
        // 定格帧必须落在 clip 后段那一截静止的据枪上。前 1.2 s 是「上前」的跨步：
        // 定在那里的人会单脚悬空站一整关（实测踝骨抬到 0.42 m，rate=0 之后再也放不下来）。
        action.time=action.getClip().duration*STAND_IDLE.advanceFireHold;rate=0;
      }
      action.setEffectiveTimeScale(rate);
      previousAction=action;
    }
    const result=original.call(this,dt,next);
    // 定格帧上的待机。carry 的 rate 也是 0，但那两只手钉在担架杆上，不能挪骨盆。
    if(action&&rate===0&&!state.carryRole&&StandIdleAllowed(soldier,next))standIdle.Apply(dt,next);
    return result;
  };
  return true;
}

export function ApplyP012CastAppearance(soldier, materialLibrary) {
  const color = P012_CAST_CLOTH_COLORS[soldier?.castId];
  const actor = soldier?.actor;
  if (color === undefined || !actor?.characterRig?.root || actor.p012ClothColor !== undefined) return false;
  const clones = new Map();
  actor.characterRig.root.traverse((object) => {
    // Weapons are mounted below the rig too; only original GLB body surfaces qualify.
    if (!object.isMesh || !object.userData.characterPbrSurface) return;
    const Replace = (material) => {
      if (material?.name !== P012_UNIFORM_MATERIAL_NAME) return material;
      if (!clones.has(material)) {
        // Material.clone JSON-copies userData, which here contains live GI/SSAO
        // uniforms. Copy PBR properties without serializing those shared buffers;
        // the library below attaches the current lighting uniforms to this clone.
        const clone = new material.constructor().copy({ ...material, userData: {} });
        clone.name = `P012Cloth_${soldier.castId}`;
        // A plain colour is deliberate whitebox identification, not a dark tint
        // multiplied by the original blue albedo. Preserve normal/roughness relief.
        clone.map = null;
        clone.color.setHex(color);
        materialLibrary?.ConfigureExternalPbr?.(clone, { metalness: 0, minRoughness: 0.58 });
        clone.needsUpdate = true;
        clones.set(material, clone);
      }
      return clones.get(material);
    };
    object.material = Array.isArray(object.material) ? object.material.map(Replace) : Replace(object.material);
  });
  if (!clones.size) return false;
  actor.p012ClothColor = color;
  const dispose = actor.Dispose;
  actor.Dispose = function DisposeP012CastAppearance(...args) {
    for (const material of clones.values()) material.dispose();
    clones.clear();
    return dispose.apply(this, args);
  };
  return true;
}
