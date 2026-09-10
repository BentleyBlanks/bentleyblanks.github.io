// Reuse the real infantry clips and the existing foot-anchored idle layer.
import { StandIdleLayer, StandIdleAllowed } from './Script_ActorStandIdle.mjs';
import { STAND_IDLE } from './Data_Tuning_ActorIdle.mjs';

export function InstallSquadMarchActor(soldier){
  const rig=soldier.actor?.characterRig;
  if(!rig||rig.squadMarchInstalled)return false;
  rig.squadMarchInstalled=true;
  // Mission actors already own measured gait and foot-anchored idle; their layer reads the command.
  if(rig.p012ActorMotion){
    const original=rig.Update;
    rig.Update=function UpdateSquadMarchMissionActor(dt,state={}){
      const recovering=soldier.squadMarchCommand?.breath&&!state.firing;
      return original.call(this,dt,recovering?{...state,aim:0,lookYaw:0}:state);
    };
    return true;
  }
  const idle=new StandIdleLayer(soldier),original=rig.Update;
  let previous=null;
  rig.Update=function UpdateSquadMarchActor(dt,state={}){
    idle.Restore();
    const command=soldier.squadMarchCommand;
    const allowed=command?.controlled&&!this.forcedClip&&StandIdleAllowed(soldier,state);
    if(!allowed){previous?.setEffectiveTimeScale(1);return original.call(this,dt,state);}
    const id=this._ActionForState(state);
    this.Play(id,.16);
    const action=this.currentAction;
    if(action){
      if(action!==previous){
        previous?.stopWarping();action.stopWarping();
        action.time=action.getClip().duration*((Number(soldier.id)*.61803398875)%1);
      }
      const moving=(state.moveSpeedMps??state.moveSpeed*3.6)>.08;
      if(id==='AdvanceFire'&&!moving){action.time=action.getClip().duration*STAND_IDLE.advanceFireHold;action.setEffectiveTimeScale(0);}
      else if(id==='RifleRun')action.setEffectiveTimeScale((state.moveSpeedMps??state.moveSpeed*3.6)/3.6);
      else action.setEffectiveTimeScale(1);
      previous=action;
    }
    const result=original.call(this,dt,state);
    if(action?.getEffectiveTimeScale()===0)idle.Apply(dt,state);
    return result;
  };
  return true;
}
