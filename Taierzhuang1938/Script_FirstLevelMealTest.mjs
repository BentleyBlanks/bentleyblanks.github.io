import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(here,'_shots/FirstLevelMeal');await fs.mkdir(output,{recursive:true});
const local=process.argv.includes('--local');
const server=local?null:await ServeRoot(path.dirname(here),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],frames=[];
page.on('pageerror',error=>errors.push(String(error)));
try{
 await page.goto(`http://127.0.0.1:${local?19093:server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:180000});
 for(const seconds of [0,.8,1.7,2.0,2.1,3.3,4.2,4.7,5.6]){
   const state=await page.evaluate(async target=>{
     const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),{Vector3}=await import('three');
     for(let step=0;step<750&&(!r.voice.current||r.voice.current.sourceTime<target);step++)g.StepFrames(1,1/60,false);
     g.StepFrames(1,1/60,true);
     const giver=r.companion.Handle('yaowa'),rig=giver.actor.characterRig;
     return {meal:r.meal.State(),voice:r.voice.State(),position:g.player.position.toArray(),eye:g.player.EyePosition.toArray(),
       sliceProjection:r.meal.slice.position.clone().project(g.player.camera).toArray(),
       giver:{position:giver.position.toArray(),yaw:giver.yaw,modelId:rig.modelId,
       hand:rig.bones.handR.getWorldPosition(new Vector3()).toArray(),left:rig.bones.handL.getWorldPosition(new Vector3()).toArray(),
       fingersFinite:['r','l'].every(side=>r.meal.anatomy?.fingerBones[side].every(b=>b.quaternion.toArray().every(Number.isFinite)))},
       receiver:g.viewmodel.riggedArms.bones.r.hand.getWorldPosition(new Vector3()).toArray(),
       fingers:g.viewmodel.riggedArms.fingerBones.r.map(b=>b.quaternion.toArray()),
       instances:{ration:r.view.parts.ration?.count??0,food:[...r.view.mealProps.values()].filter(p=>p.visible).length},
       props:[r.meal.whole,r.meal.slice].map(o=>{let vertices=0;o.traverse(n=>vertices+=n.geometry?.attributes.position.count||0);return {name:o.name,visible:o.visible,vertices}})};
   },seconds);
   frames.push(state);console.log('MEAL_FRAME',seconds,JSON.stringify({meal:state.meal,giver:state.giver,receiver:state.receiver}));
   await page.screenshot({path:path.join(output,`Scene_Meal${Math.round(seconds*100)}.png`)});
   if(seconds===1.7){
     const look=await page.evaluate(()=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),yaw=g.player.yaw,pitch=g.player.pitch,results=[];
       for(const angle of [-1.25,1.25]){g.player.yaw=angle;g.player.pitch=-.3;g.StepFrames(1,1/60,false);results.push(r.meal.State())}
       g.player.yaw=yaw;g.player.pitch=pitch;g.StepFrames(1,1/60,false);return results});
     assert.ok(look.every(frame=>frame.handSeparation<.035),'free look preserves physical hand contact');
     const pause=await page.evaluate(()=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();r.voice.Pause();const before=r.meal.State();g.StepFrames(60,1/60,false);const after=r.meal.State();r.voice.Resume();return {before,after}});
     assert.equal(pause.before.seconds,pause.after.seconds,'paused audio freezes handoff clock');
     assert.equal(pause.before.owner,pause.after.owner,'pause never transfers ownership while the train continues moving');
   }
 }
 assert.ok(frames.every(f=>f.instances.ration===0),'no box rations');
 assert.ok(frames.every(f=>f.giver.fingersFinite),'all original donor finger rotations remain finite');
 assert.ok(frames.slice(0,-1).every(f=>f.props.every(p=>p.vertices>24)),'real modeled tissue, not cube stand-ins');
 assert.equal(frames[3].meal.owner,'giver');assert.equal(frames[4].meal.owner,'receiver');
 assert.ok(frames[3].meal.handSeparation<.035&&frames[4].meal.handSeparation<.035,'both hands meet across transfer');
 const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 assert.ok(distance(frames[0].giver.hand,frames[2].giver.hand)>.12,'giver visibly extends the arm');
 assert.ok(distance(frames[2].receiver,frames[5].receiver)>.08,'receiver visibly withdraws the hand');
 assert.ok(Math.abs(frames[5].sliceProjection[0])<.85&&Math.abs(frames[5].sliceProjection[1])<.85,'the received slice remains clearly inside the actual camera view');
 assert.notDeepEqual(frames[0].fingers,frames[4].fingers,'recipient closes fingers');
 assert.equal(frames.at(-1).meal.sliceVisible,false);assert.equal(frames.at(-1).meal.active,false);
 assert.deepEqual(errors,[]);
 console.log('PASS Blender food, synchronized give/receive, fingers, pause and cleanup');
}finally{
 await fs.writeFile(path.join(output,'Data_MealReview.json'),JSON.stringify({frames,errors},null,2));
 await browser.close();await new Promise(resolve=>server?server.close(resolve):resolve());
}
