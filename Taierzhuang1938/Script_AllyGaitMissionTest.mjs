// Observe the ordinary 06 -> 07 escort driver. Never modify mission facts or actor states.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ParseCampaignArgs, OpenCampaign, CloseCampaign, CaptureFailure, InstallInputDriver } from './Script_FirstLevelCampaignKit.mjs';
import { Drive } from './Script_FirstLevelCampaignFront.mjs';
const options=ParseCampaignArgs(['--campaign','--stage-from=6','--stage-to=7','--evidence-tag=AllyGait']);
const ctx=await OpenCampaign(options);
try {
  await InstallInputDriver(ctx);
  await ctx.page.evaluate(async()=>{
    const g=window.Tengxian,THREE=await import('three');
    const soldiers=g.ai.soldiers.filter(s=>s.actor?.characterRig?.modelId?.startsWith('TengxianNra'));
    await Promise.all(soldiers.map(s=>s.actor.characterRig.allyGaitReady));
    window.AllyGaitMissionEvidence={models:[],clips:{},carryFrames:0,carryGripMax:0,fireCarryFrames:0,errors:[]};
    const evidence=window.AllyGaitMissionEvidence;
    for(const soldier of soldiers){
      const actor=soldier.actor,rig=actor.characterRig;
      evidence.models.push({id:soldier.id,cast:soldier.castId,model:rig.modelId,installed:!!rig.allyGaitInstalled,error:rig.allyGaitError});
      const update=actor.Update,grip=new THREE.Vector3(),gun=new THREE.Vector3();
      actor.Update=function ObserveAllyGait(dt,state={}){
        const result=update.call(this,dt,state),id=rig.currentId;
        if(soldier.alive&&dt>0){
          evidence.clips[id]=(evidence.clips[id]||0)+1;
          if(id?.startsWith('Ally')&&id.includes('Carry')){
            evidence.carryFrames++;
            if(state.firing)evidence.fireCarryFrames++;
            if(this.weaponGroup?.visible&&rig.allyCarryWeight>.999&&!this.goreWeaponHold){
              rig.Grip('weaponR').getWorldPosition(grip);this.weaponGroup.getWorldPosition(gun);
              evidence.carryGripMax=Math.max(evidence.carryGripMax,grip.distanceTo(gun));
            }
          }
        }
        return result;
      };
    }
  });
  await Drive(ctx);
  const result=await ctx.page.evaluate(()=>({evidence:window.AllyGaitMissionEvidence,stage:window.Tengxian.Debug.FirstLevelMission().stage}));
  await fs.writeFile(path.join(ctx.output,'Data_AllyGaitMission.json'),JSON.stringify(result,null,2));
  assert.equal(result.stage,'Village','ordinary escort reaches the village');
  assert.ok(result.evidence.models.some(m=>m.installed),'first-level spawn path installs the gait');
  assert.ok(result.evidence.carryFrames>30,'actual escort/dialogue selects carry');
  assert.equal(result.evidence.fireCarryFrames,0,'real firing always raises the rifle');
  assert.ok(result.evidence.carryGripMax<.025,'real dialogue/movement keeps the rifle in the palm');
  assert.deepEqual(ctx.errors,[]);
  console.log('PASS AllyGaitMissionTest',JSON.stringify(result),ctx.output);
} catch(error){await CaptureFailure(ctx);throw error;}
finally {await CloseCampaign(ctx);}
