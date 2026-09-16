// Actual geometry/collision audit. Stage fixtures here are not campaign completion evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'_shots/TopologyRebuild');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,'..'),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high&scale=small`,{timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:240000});
 const result=await page.evaluate(async()=>{
  const g=window.Tengxian,{MISSION_ROUTES:routes,MISSION_ANCHORS:A}=await import('./Data_FirstLevelMissionLayout.mjs');
  const {FirstLevelMissionColumn}=await import('./Script_FirstLevelMissionColumn.mjs');
  const {MISSION_RECEPTION_SPACE:reception}=await import('./Data_FirstLevelMissionTopology.mjs');
  const column=new FirstLevelMissionColumn();column.mode='exit';column.route=routes.evacuation;
  const litter=column.litters[0];Object.assign(litter,reception.litterOrigin,{yaw:0,bearers:[0,100]});
  // 救援 helper 的选人口径在 Script_FirstLevelMissionColumn 里是 medic **或** civilian；
  // 2026-09-16 的 e4fe8b315 把 medicCount 调成 0（担架队边上不再走军医），夹具还在
  // 只找 medic，于是 Object.assign 拿到 undefined。跟上运行时那条口径。
  const helper=column.walkers.find(w=>['medic','civilian'].includes(w.kind));Object.assign(helper,reception.walkerOrigin,{visible:true});
  column.RequestBearer(litter);
  const walkRoutes={...routes,wardRelief:helper.rescueRoute};
  const {Vector3}=await import('three'),walks=[],body=g.physics.MakeCharacter();
  try{
   for(const name of ['evacuation','reception','exit','wardRelief'])for(const reverse of [false,true]){
    const points=reverse?[...walkRoutes[name]].reverse():walkRoutes[name];
    body.Teleport(points[0].x,g.physics.groundAt(points[0].x,points[0].z)+.03,points[0].z);
    let reached=1;
    for(const target of points.slice(1)){
     const budget=Math.ceil(Math.hypot(target.x-body.position.x,target.z-body.position.z)/.04)+240;
     for(let frame=0;frame<budget;frame++){
      const dx=target.x-body.position.x,dz=target.z-body.position.z,d=Math.hypot(dx,dz);
      if(d<.18){reached++;break;}
      body.Move(dx/d*Math.min(.06,d),-.07,dz/d*Math.min(.06,d));
     }
     if(reached!==points.indexOf(target)+1)break;
    }
    walks.push({name,reverse,reached,expected:points.length,position:body.position.toArray()});
   }
  }finally{body.Remove();}
  const bridge=g.battlefield.gates.get('TemporaryBridge'),wreck=g.battlefield.gates.get('MissionBridgeWreck');
  const before={bridge:bridge.mesh.visible,wreck:wreck.mesh.visible,bridgeWalkable:g.battlefield.walkableSurfaces.some(s=>s.id==='TemporaryBridge')};
  g.battlefield.OpenGate('TemporaryBridge');g.battlefield.CloseGate('MissionBridgeWreck');
  g.physics.RefreshStaticQueries();
  const hit=g.battlefield.Raycast(new Vector3(76,1,145),new Vector3(0,0,1),16,{terrain:true});
  const after={bridge:bridge.mesh.visible,wreck:wreck.mesh.visible,bridgeWalkable:g.battlefield.walkableSurfaces.some(s=>s.id==='TemporaryBridge'),blocked:!!hit};
  const sight=[];
  for(const [from,to] of [[A.retreatA,A.retreatB],[A.retreatB,A.retreatC]]){
   const a=new Vector3(from.x,g.physics.groundAt(from.x,from.z)+1.6,from.z),b=new Vector3(to.x,g.physics.groundAt(to.x,to.z)+1.6,to.z),delta=b.sub(a),distance=delta.length();
   const hit=g.battlefield.Raycast(a,delta.normalize(),distance,{terrain:true});sight.push({from,to,blocked:!!hit&&hit.t<distance-.1});
  }
  return {walks,before,after,sight};
 });
 await fs.writeFile(path.join(out,'Data_PhysicalTopology.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 for(const view of [
  {id:'RearOverview',eye:[27,190,183],target:[27,0,183]},
  {id:'ReceptionOverview',eye:[-23,66,263],target:[-23,0,237]},
  {id:'BridgeDestroyed',eye:[101,24,168],target:[75,0,145]},
 ]){
  await page.evaluate(async view=>{
   const g=window.Tengxian,{PerspectiveCamera}=await import('three');
   const camera=new PerspectiveCamera(58,1280/720,.1,900);camera.position.set(...view.eye);
   camera.up.set(0,view.eye[2]===view.target[2]?0:1,view.eye[2]===view.target[2]?-1:0);
   camera.lookAt(...view.target);camera.updateMatrixWorld(true);
   document.querySelector('#hud').style.visibility='hidden';
   g.scene.updateMatrixWorld(true);g.renderer.setRenderTarget(null);g.renderer.clear();g.renderer.render(g.scene,camera);
  },view);
  await page.screenshot({path:path.join(out,`Scene_${view.id}.png`)});
 }
 await page.evaluate(()=>{document.querySelector('#hud').style.visibility='';});
 assert.ok(result.walks.every(r=>r.reached===r.expected),'actual Rapier capsule walks both directions: '+JSON.stringify(result.walks.filter(r=>r.reached!==r.expected)));
 assert.deepEqual(result.before,{bridge:true,wreck:false,bridgeWalkable:true});
 assert.deepEqual(result.after,{bridge:false,wreck:true,bridgeWalkable:false,blocked:true});
 assert.ok(result.sight.every(s=>s.blocked),'successive pockets break actual standing sightlines');
 // Exercise the real frame-level scenario sync, including backward replay.
 // A manual CloseGate alone misses regressions that reopen the wreck next frame.
 const lifecycle=[];
 for(const phase of [14,12]){
  await page.evaluate(phase=>window.Tengxian.Debug.FirstLevelJump(phase),phase);
  lifecycle.push(await page.evaluate(()=>{
   const g=window.Tengxian;g.StepFrames(12,1/60,false);g.physics.RefreshStaticQueries();
   return {phase:g.Debug.FirstLevelMission().phaseNumber,
    destroyed:g.Debug.FirstLevelMissionRuntime().Has('MissionBridgeDestroyed'),
    bridge:g.battlefield.gates.get('TemporaryBridge').mesh.visible,
    wreck:g.battlefield.gates.get('MissionBridgeWreck').mesh.visible,
    walkable:g.battlefield.walkableSurfaces.some(s=>s.id==='TemporaryBridge')};
  }));
 }
 assert.deepEqual(lifecycle,[
  {phase:14,destroyed:true,bridge:false,wreck:true,walkable:false},
  {phase:12,destroyed:false,bridge:true,wreck:false,walkable:true},
 ]);
 await fs.writeFile(path.join(out,'Data_BridgeRuntimeLifecycle.json'),JSON.stringify(lifecycle,null,2));
 await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(8));
 const kitchenGate=await page.evaluate(()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
  const Visit=(x,z)=>{
   const y=g.battlefield.GroundHeight(x,z)+.03;
   g.player.position.set(x,y,z);g.player.body.Teleport(x,y,z);g.StepFrames(2,1/60,false);
   return {kitchen:r.Has('kitchenTraversed'),court:r.Has('innerCourtReached'),stage:r.flow.stage.id};
  };
  return {shortcut:Visit(58,6),kitchen:Visit(58,-8),court:Visit(58,6)};
 });
 assert.deepEqual(kitchenGate,{
  shortcut:{kitchen:false,court:false,stage:'Village'},
  kitchen:{kitchen:true,court:false,stage:'Village'},
  court:{kitchen:true,court:true,stage:'Melee'},
 });
 await fs.writeFile(path.join(out,'Data_KitchenGate.json'),JSON.stringify(kitchenGate,null,2));
 assert.deepEqual(errors,[]);
 console.log('ok physical rear routes, shared reception doors, bridge collision lifecycle and 720p scene review views');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
