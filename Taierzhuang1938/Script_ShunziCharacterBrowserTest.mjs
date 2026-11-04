// Shunzi's real preview consumer: representative clips, rigid original head/cap,
// finite skinning, character selection, playback and 720p evidence. Runner owns GPU slot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'tmp/Shunzi');
fs.mkdirSync(output,{recursive:true});
const custom=process.argv.find(x=>x.startsWith('--url='))?.slice(6);
const server=custom?null:await ServeRoot(root,0);
const base=custom??`http://127.0.0.1:${server.address().port}`;
const browser=await LaunchBrowser({extraArgs:['--mute-audio']});
const errors=[];
const clips=['Animation_Mixamo_Idle_V1.glb','Animation_Mixamo_RifleAimingIdle_V1.glb','Animation_Mixamo_Walking_V3.glb','Animation_Mixamo_RifleRun_V1.glb','Animation_Mixamo_CrouchWalking_V1.glb','Animation_Mixamo_ProneForward_V1.glb'];
try {
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 page.on('pageerror',error=>{errors.push(String(error));console.error('[pageerror]',String(error));});
 page.on('console',message=>{if(message.type()==='error'){errors.push(message.text());console.error('[console]',message.text());}});
 await page.addInitScript(()=>{
   if(!['127.0.0.1','localhost'].includes(location.hostname))return;
   localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));
   localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));
 });
 await page.goto(`${base}/Taierzhuang1938/Tool_MixamoAnimationPreview.html?who=shunzi`,{waitUntil:'domcontentloaded'});
 try {
   await page.waitForFunction(()=>{
     if(document.querySelector('#summary')?.textContent.startsWith('读不到动作库'))throw Error(document.querySelector('#status')?.textContent);
     return window.__preview?.action&&document.querySelector('#who')?.value==='shunzi';
   },null,{timeout:180000});
 } catch(error) {
   console.error('[startup]',await page.evaluate(()=>({text:document.body.innerText.slice(-3500),preview:!!window.__preview,action:!!window.__preview?.action,who:document.querySelector('#who')?.value})));
   await page.screenshot({path:path.join(output,'Check_ShunziStartupFailure.png')});
   throw error;
 }
 await page.locator('#play').click();
 const info=await page.evaluate(()=>{
   const p=window.__preview;
   const mesh=p.character.getObjectByProperty('isSkinnedMesh',true);
   const head=mesh.skeleton.getBoneByName('Head'),weight=mesh.geometry.attributes.skinWeight,joint=mesh.geometry.attributes.skinIndex;
   const headIndex=mesh.skeleton.bones.indexOf(head),headVertices=[];
   for(let i=0;i<weight.count;i++){let sum=0;for(let k=0;k<4;k++)if(joint.getComponent(i,k)===headIndex)sum+=weight.getComponent(i,k);if(sum>.99999)headVertices.push(i);}
   window.__shunziAudit={mesh,head,headVertices};
   Object.assign(p.orbit,{yaw:.45,pitch:.12,dist:3.25});p.orbit.target.set(0,.9,0);p.orbit.pan.set(0,0,0);
   return {name:mesh.name,material:mesh.material.name,vertices:weight.count,bones:mesh.skeleton.bones.length,rigidHeadVertices:headVertices.length};
 });
 assert.match(info.material,/Shunzi/);assert.equal(info.bones,65);assert.ok(info.rigidHeadVertices>4000);
 const results=[];
 for(const file of clips){
   console.log('[Shunzi review]',file);
   const result=await page.evaluate(async file=>{
     const p=window.__preview;await p.SelectFile(file);
     const {mesh,head,headVertices}=window.__shunziAudit,V=p.camera.position.constructor;
     const action=p.action,mixer=action.getMixer(),duration=action.getClip().duration;
     const Pose=time=>{action.paused=false;mixer.setTime(time);action.paused=true;p.Place();mesh.skeleton.update();};
     const Point=i=>mesh.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld);
     Pose(0);const headInverse=head.matrixWorld.clone().invert();
     const rigidSample=headVertices.filter((_,i)=>i%8===0).map(i=>[i,Point(i).applyMatrix4(headInverse)]);
     let maxHeadError=0,minY=Infinity,maxY=-Infinity,maxExtent=0,frames=0;
     for(let f=0;f<=60;f++){
       Pose(Math.min(duration-.00001,duration*f/60));
       const inverse=head.matrixWorld.clone().invert();
       for(const [i,rest] of rigidSample)maxHeadError=Math.max(maxHeadError,Point(i).applyMatrix4(inverse).distanceTo(rest));
       const hips=p.character.getObjectByName('Hips').getWorldPosition(new V());
       const step=f%30===0?1:32;
       for(let i=0;i<mesh.geometry.attributes.position.count;i+=step){
         const v=Point(i);if(!Number.isFinite(v.x+v.y+v.z))throw Error('Non-finite skinned point');
         minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);maxExtent=Math.max(maxExtent,v.distanceTo(hips));
       }
       frames++;
     }
     Pose(duration*.5);
     const hips=p.character.getObjectByName('Hips').getWorldPosition(new V());p.orbit.target.copy(hips);p.orbit.target.y=Math.max(.55,hips.y);p.orbit.pan.set(0,0,0);
     return {file,duration,frames,maxHeadErrorM:maxHeadError,minY,maxY,maxExtent};
   },file);
   assert.ok(result.maxHeadErrorM<.00001,`${file}: original head and cap must stay rigid`);
   assert.ok(result.maxExtent<1.8,`${file}: skin must remain around its skeleton`);
   await page.waitForTimeout(150);
   await page.screenshot({path:path.join(output,`Check_Shunzi_${file.replace('.glb','')}.png`)});
   results.push(result);
 }
 // Confirm real time advances through the UI, then resume the paused inspection state.
 await page.evaluate(()=>{window.__preview.action.paused=false;});
 const before=await page.evaluate(()=>window.__preview.action.time);
 await page.locator('#play').click();await page.waitForTimeout(350);await page.locator('#play').click();
 const after=await page.evaluate(()=>window.__preview.action.time);
 assert.ok(Math.abs(after-before)>.01,'Playback must advance');
 // Deliberate head turns also expose the cap rim and the original neck/collar connection.
 for(const yaw of [-.78,.78]){
   await page.evaluate(yaw=>{
     const p=window.__preview,{mesh,head}=window.__shunziAudit,V=p.camera.position.constructor,Q=head.quaternion.constructor;
     p.action.getMixer().stopAllAction();mesh.skeleton.pose();p.character.updateMatrixWorld(true);
     const parent=head.parent.getWorldQuaternion(new Q()).invert(),rest=head.getWorldQuaternion(new Q());
     head.quaternion.copy(parent).multiply(new Q().setFromAxisAngle(new V(0,1,0),yaw)).multiply(rest);
     p.Place();mesh.skeleton.update();
     const h=head.getWorldPosition(new V());Object.assign(p.orbit,{yaw:0,pitch:-.23,dist:.66});p.orbit.target.copy(h).add(new V(0,.07,0));p.orbit.pan.set(0,0,0);
   },yaw);
   await page.waitForTimeout(150);
   await page.screenshot({path:path.join(output,`Check_Shunzi_HeadTurn${yaw<0?'Left':'Right'}.png`)});
 }
 assert.deepEqual(errors,[],'Preview must render without browser errors');
 fs.writeFileSync(path.join(output,'Data_ShunziBrowserReview.json'),JSON.stringify({schema:1,viewport:[1280,720],muted:true,info,clips:results,errors},null,2));
 console.log('ShunziCharacterBrowserTest ok',JSON.stringify({info,clips:results.length,maxHeadErrorM:Math.max(...results.map(x=>x.maxHeadErrorM))}));
} finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
