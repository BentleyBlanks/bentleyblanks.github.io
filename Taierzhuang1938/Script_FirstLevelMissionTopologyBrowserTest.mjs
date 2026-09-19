// 第一关 2026.09.19 四区拓扑 · 实机几何/碰撞审计。
// 真 Rapier 胶囊**双向**走每一条契约路线；两座桥的炸前/炸后四态；掩蔽部两态。
// 这里的夹具不是通关证据（stage fixtures are not campaign completion evidence）。
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
 // 掩蔽部的坍塌态是 01 的空间：胶囊要在坍塌后的壳里走，不是在完好的壳里走。
 await page.evaluate(()=>window.Tengxian.battlefield.SetScenarioState(
  window.Tengxian.battlefield.layout.scenario.states.find(s=>s.id==='BunkerCollapsed')));
 const result=await page.evaluate(async()=>{
  const g=window.Tengxian,{MISSION_ROUTES:routes}=await import('./Data_FirstLevelMissionLayout.mjs');
  const {MISSION_STAGE_ROUTES}=await import('./Data_FirstLevelMissionTopology.mjs');
  const walkRoutes={evacuation:routes.evacuation,reception:routes.reception,exit:routes.exit,
   ...MISSION_STAGE_ROUTES};
  // 夜景那一片白天不存在，单独在下面的状态循环里走。
  delete walkRoutes.nightMarch;
  // 10 的绕回巷从内院门出去 —— 那扇门在 courtyardGateOpen 之前是**关着**的
  // （这正是 10 要做的事）。量的是门开之后这条路通不通。
  g.battlefield.OpenGate('MissionCourtyardGate');g.physics.RefreshStaticQueries();
  const walks=[],body=g.physics.MakeCharacter();
  try{
   for(const [name,points] of Object.entries(walkRoutes))for(const reverse of [false,true]){
    const path=reverse?[...points].reverse():points;
    body.Teleport(path[0].x,g.physics.groundAt(path[0].x,path[0].z)+.03,path[0].z);
    let reached=1;
    for(const target of path.slice(1)){
     const budget=Math.ceil(Math.hypot(target.x-body.position.x,target.z-body.position.z)/.04)+320;
     for(let frame=0;frame<budget;frame++){
      const dx=target.x-body.position.x,dz=target.z-body.position.z,d=Math.hypot(dx,dz);
      if(d<.25){reached++;break;}
      body.Move(dx/d*Math.min(.06,d),-.07,dz/d*Math.min(.06,d));
     }
     if(reached!==path.indexOf(target)+1)break;
    }
    walks.push({name,reverse,reached,expected:path.length,position:body.position.toArray().map(v=>+v.toFixed(2))});
   }
  }finally{body.Remove();}
  return {walks};
 });
 await fs.writeFile(path.join(out,'Data_PhysicalTopology.json'),JSON.stringify(result,null,2));
 const failed=result.walks.filter(r=>r.reached!==r.expected);
 assert.deepEqual(failed,[],'actual Rapier capsule walks both directions: '+JSON.stringify(failed));
 // -------------------------------------------------------------------------
 // 水面是示意不是空间；军列几何真的从场上消失了
 // -------------------------------------------------------------------------
 const river=await page.evaluate(async()=>{
  const g=window.Tengxian,{Vector3}=await import('three');
  const {MISSION_LAYOUT}=await import('./Data_FirstLevelMissionLayout.mjs');
  const water=MISSION_LAYOUT.blocks.filter(b=>b.semantic==='water');
  const sample=water[Math.floor(water.length/2)];
  // 实机射线穿过水面那一层：碰不到任何实体（水没有碰撞，子弹也不停）。
  const through=g.battlefield.Raycast(new Vector3(sample.x,sample.y,sample.z-6),
   new Vector3(0,0,1),12,{terrain:false});
  // 水面之上贴着走一趟：脚下是河床不是水皮。
  const floorY=g.battlefield.GroundHeight(sample.x,sample.z);
  return {water:water.length,throughId:through?.box?.id||through?.box?.tag||null,
   waterTopY:+(sample.y+sample.h/2).toFixed(2),floorY:+floorY.toFixed(2),
   trainColliders:g.battlefield.colliders.filter(c=>/^Station|^TrainDoor/.test(c.id||'')).length,
   bounds:g.battlefield.bounds};
 });
 await fs.writeFile(path.join(out,'Data_RiverSurface.json'),JSON.stringify(river,null,2));
 assert.ok(river.water>=30,'the channel carries a water surface: '+river.water);
 assert.equal(river.throughId,null,'a shot crosses the river surface without hitting anything');
 assert.ok(river.waterTopY-river.floorY>=1&&river.waterTopY-river.floorY<=1.4,
  'the water stands 1.0-1.4 m over the channel floor, and the floor is still what you stand on: '
  +JSON.stringify({waterTopY:river.waterTopY,floorY:river.floorY}));
 assert.equal(river.trainColliders,0,'no train or station collider survives in the live field');
 assert.ok(river.bounds.maxZ<=400&&river.bounds.minZ>=-245,
  'the live field uses the shrunken bounds: '+JSON.stringify(river.bounds));
 // -------------------------------------------------------------------------
 // 两座桥的四态：路桥炸前/炸后 × 铁路桥炸前/炸后
 // -------------------------------------------------------------------------
 const bridges=await page.evaluate(async()=>{
  const g=window.Tengxian,{Vector3}=await import('three');
  const Walkable=id=>g.battlefield.walkableSurfaces.some(s=>s.id===id);
  const Visible=id=>!!g.battlefield.gates.get(id)?.mesh.visible;
  // 站在桥面正上方往下探：甲板在就踩得到，甲板没了就掉进 -4 m 的河槽。
  const DeckTop=(x,z)=>g.battlefield.GroundHeight(x,z);
  const Snapshot=()=>({
   road:Visible('TemporaryBridge'),roadWalkable:Walkable('TemporaryBridge'),
   roadWreck:Visible('MissionBridgeWreck'),
   rail:Visible('RailBridgeDeck'),railWalkable:Walkable('RailBridgeDeck'),
   railWreck:Visible('RailBridgeWreckSpan'),
   railDeckY:+DeckTop(-77,153).toFixed(2),roadDeckY:+DeckTop(76,153).toFixed(2),
  });
  const states=[];
  states.push({phase:'intact',...Snapshot()});
  g.battlefield.OpenGate('TemporaryBridge');g.battlefield.CloseGate('MissionBridgeWreck');
  g.physics.RefreshStaticQueries();
  states.push({phase:'roadDestroyed',...Snapshot()});
  for(const id of ['RailBridgeDeck','RailBridgeTrussWest','RailBridgeTrussEast',
   'RailBridgeRailWest','RailBridgeRailEast'])g.battlefield.OpenGate(id);
  for(const id of ['RailBridgeWreckSpan','RailBridgeWreckTruss','RailBridgeWreckStub'])
   g.battlefield.CloseGate(id);
  g.physics.RefreshStaticQueries();
  states.push({phase:'bothDestroyed',...Snapshot()});
  // 炸后桥面那一格必须是河槽，不是隐形的空中走道。
  const blocked=!!g.battlefield.Raycast(new Vector3(-77,1,132),new Vector3(0,0,1),12,{terrain:true});
  for(const id of ['RailBridgeWreckSpan','RailBridgeWreckTruss','RailBridgeWreckStub'])
   g.battlefield.OpenGate(id);
  for(const id of ['RailBridgeDeck','RailBridgeTrussWest','RailBridgeTrussEast',
   'RailBridgeRailWest','RailBridgeRailEast'])g.battlefield.CloseGate(id);
  g.battlefield.CloseGate('TemporaryBridge');g.battlefield.OpenGate('MissionBridgeWreck');
  g.physics.RefreshStaticQueries();
  states.push({phase:'restored',...Snapshot()});
  return {states,blocked};
 });
 await fs.writeFile(path.join(out,'Data_BridgeStates.json'),JSON.stringify(bridges,null,2));
 const byPhase=Object.fromEntries(bridges.states.map(s=>[s.phase,s]));
 assert.equal(byPhase.intact.roadWalkable,true,'the road bridge carries the column before the air strike');
 assert.equal(byPhase.intact.railWalkable,true,'the rail bridge deck carries the rear column');
 assert.ok(byPhase.intact.railDeckY>0.4,'the intact rail deck stands above the channel floor');
 assert.equal(byPhase.roadDestroyed.roadWalkable,false,'the road deck leaves the walkable set');
 assert.equal(byPhase.roadDestroyed.roadWreck,true,'the road wreck appears in its place');
 assert.equal(byPhase.roadDestroyed.railWalkable,true,'the rail bridge is independent of the road bridge');
 assert.equal(byPhase.bothDestroyed.railWalkable,false,'the demolished rail bridge carries nobody');
 assert.equal(byPhase.bothDestroyed.railWreck,true,'the fallen span is visible in the channel');
 assert.ok(byPhase.bothDestroyed.railDeckY<-2,
  'the destroyed span leaves a 4 m channel, not an invisible walkway: '+byPhase.bothDestroyed.railDeckY);
 assert.equal(bridges.blocked,true,'the wreckage physically obstructs the old crossing');
 const Without=({phase,...rest})=>rest;
 assert.deepEqual(Without(byPhase.restored),Without(byPhase.intact),
  'checkpoint replay restores both bridges exactly');
 // -------------------------------------------------------------------------
 // 夜景片：白天不存在，NightGateShown 之后才走得进北门
 // -------------------------------------------------------------------------
 const night=await page.evaluate(async()=>{
  const g=window.Tengxian,{MISSION_STAGE_ROUTES}=await import('./Data_FirstLevelMissionTopology.mjs');
  const {MISSION_NIGHT_GATE_BLOCK_IDS}=await import('./Data_FirstLevelMissionLayout.mjs');
  const Count=()=>g.battlefield.colliders.length;
  const day=Count();
  const state=g.battlefield.layout.scenario.states.find(s=>s.signal==='NightGateShown');
  g.battlefield.SetScenarioState(state);g.physics.RefreshStaticQueries();
  const shown=Count();
  const body=g.physics.MakeCharacter();
  const points=MISSION_STAGE_ROUTES.nightMarch;
  body.Teleport(points[0].x,g.physics.groundAt(points[0].x,points[0].z)+.03,points[0].z);
  let reached=1;
  for(const target of points.slice(1)){
   const budget=Math.ceil(Math.hypot(target.x-body.position.x,target.z-body.position.z)/.04)+320;
   for(let frame=0;frame<budget;frame++){
    const dx=target.x-body.position.x,dz=target.z-body.position.z,d=Math.hypot(dx,dz);
    if(d<.25){reached++;break;}
    body.Move(dx/d*Math.min(.06,d),-.07,dz/d*Math.min(.06,d));
   }
   if(reached!==points.indexOf(target)+1)break;
  }
  body.Remove();
  g.battlefield.SetScenarioState(g.battlefield.layout.scenario.states.find(s=>s.id==='BunkerCollapsed'));
  g.physics.RefreshStaticQueries();
  return {day,shown,added:shown-day,nightIds:MISSION_NIGHT_GATE_BLOCK_IDS.length,
   reached,expected:points.length,restored:Count()};
 });
 await fs.writeFile(path.join(out,'Data_NightGate.json'),JSON.stringify(night,null,2));
 assert.ok(night.added>=10,'the night slice adds real colliders only once its signal lands: '+night.added);
 assert.equal(night.restored,night.day,'leaving the night state removes every one of them again');
 assert.equal(night.reached,night.expected,'the squad walks the north gate road into the city');
 // -------------------------------------------------------------------------
 // 720p 复核机位
 // -------------------------------------------------------------------------
 for(const view of [
  {id:'BunkerCollapsed',eye:[-40,26,-108],target:[-40,0,-134]},
  {id:'CollectionBackslope',eye:[-37,30,-78],target:[-37,0,-108]},
  {id:'VillageStreetBlock',eye:[77,34,-12],target:[77,0,24]},
  // 07 南行新线的中段（沟身出来那一段）与东南侧巷／车位：两处都是第二波改动的。
  {id:'SouthWalkMiddle',eye:[-10,30,-70],target:[6,0,-26]},
  {id:'SideAlleyAndBays',eye:[118,34,140],target:[86,0,118]},
  {id:'TransferAndRiver',eye:[76,62,88],target:[76,0,150]},
  {id:'RiverRoadBridge',eye:[76,10,132],target:[76,-3,168]},
  {id:'RailBridge',eye:[-40,40,196],target:[-77,0,152]},
  {id:'WallPathAndReception',eye:[30,44,196],target:[4,0,236]},
 ]){
  await page.evaluate(async view=>{
   const g=window.Tengxian,{PerspectiveCamera}=await import('three');
   const camera=new PerspectiveCamera(58,1280/720,.1,900);camera.position.set(...view.eye);
   camera.lookAt(...view.target);camera.updateMatrixWorld(true);
   document.querySelector('#hud').style.visibility='hidden';
   g.scene.updateMatrixWorld(true);g.renderer.setRenderTarget(null);g.renderer.clear();g.renderer.render(g.scene,camera);
  },view);
  await page.screenshot({path:path.join(out,`Scene_${view.id}.png`)});
 }
 await page.evaluate(()=>{document.querySelector('#hud').style.visibility='';});
 assert.deepEqual(errors,[]);
 console.log('ok physical four-zone routes, four bridge states, the night slice and 720p review views',
  JSON.stringify({walks:result.walks.length,night}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
