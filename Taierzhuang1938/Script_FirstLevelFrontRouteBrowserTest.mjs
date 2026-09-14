import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'_shots/FrontSortie');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,'..'),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>{errors.push(String(error));console.log('PAGEERROR',String(error));});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high&scale=small`,{timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:240000});
 const physical=await page.evaluate(async()=>{
  const g=window.Tengxian,{FRONT_SORTIE:R,SortieCrawlBlocked}=await import('./Data_FirstLevelFrontRoute.mjs');
  const routes=[R.route,[...R.route].reverse()],walks=[],body=g.physics.MakeCharacter({radius:.42,height:.58});
  for(const [i,route] of routes.entries()){
   body.Teleport(route[0].x,g.physics.groundAt(route[0].x,route[0].z)+.03,route[0].z);
   let reached=1;
   for(const target of route.slice(1)){
    for(let frame=0;frame<1400;frame++){
     const dx=target.x-body.position.x,dz=target.z-body.position.z,d=Math.hypot(dx,dz);
     if(d<.18){reached++;break;}
     body.Move(dx/d*Math.min(.07,d),-.06,dz/d*Math.min(.07,d));
    }
    if(reached!==route.indexOf(target)+1)break;
   }
   walks.push({reverse:!!i,reached,total:route.length,position:body.position.toArray()});
  }
  const crawl=[];
  for(const passage of R.crawl)for(const height of [1.78,1.2,.58]){
   body.SetSize(height===.58?.42:.34,height);
   body.Teleport(passage.x,g.physics.groundAt(passage.x,passage.z+passage.d/2+2)+.03,passage.z+passage.d/2+2);
   for(let frame=0;frame<180;frame++){
    const next={x:body.position.x,z:body.position.z-.05};
    if(!SortieCrawlBlocked(body.position,next,height===.58?'prone':height===1.2?'crouch':'stand'))body.Move(0,-.06,-.05);
   }
   crawl.push({id:passage.id,height,overlap:g.physics.Overlaps(passage.x,g.physics.groundAt(passage.x,passage.z),passage.z,height===.58?.42:.34,height),passed:body.position.z<passage.z-passage.d/2,position:body.position.toArray()});
  }
  body.Remove();return {walks,crawl};
 });
 await fs.writeFile(path.join(out,'Data_PhysicalRoute.json'),JSON.stringify(physical,null,2));
 console.log('PHYSICAL',JSON.stringify(physical));
 for(const view of [
  {id:'SortieOverview',eye:[60,115,-160],target:[40,0,-160]},
  {id:'CrawlPassage',eye:[49,1,-122],target:[49,-1,-130]},
  {id:'SupplyHouse',eye:[51,12,-203],target:[40,0,-214]},
 ]){
  await page.evaluate(async view=>{
   const g=window.Tengxian,{PerspectiveCamera}=await import('three'),camera=new PerspectiveCamera(58,1280/720,.1,900);
   camera.position.set(...view.eye);camera.lookAt(...view.target);camera.updateMatrixWorld(true);
   document.querySelector('#hud').style.visibility='hidden';g.scene.updateMatrixWorld(true);
   g.renderer.setRenderTarget(null);g.renderer.clear();g.renderer.render(g.scene,camera);
  },view);
  await page.screenshot({path:path.join(out,`Scene_${view.id}.png`)});
 }
 await page.evaluate(()=>document.querySelector('#hud').style.visibility='');
 assert.ok(physical.walks.every(w=>w.reached===w.total),'prone route passes both ways: '+JSON.stringify(physical.walks));
 assert.ok(physical.crawl.every(c=>c.passed===(c.height===.58)),'crawl passages reject standing/crouching and admit prone');
 // Isolated real-runtime fixtures: these are not a claim of a whole campaign playthrough.
 await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(4));
 const optional=await page.evaluate(()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
  r.UpdateFrontAttack();const before=r.Has('frontAttackRepelled');
  for(const actor of r.enemies.values())if(actor.missionEncounter==='machineGun')actor.TakeHit(1000,'head',g.player.position.clone());
  r.UpdateFrontAttack();
  return {before,after:r.Has('frontAttackRepelled'),mounted:g.emplacement.stats.occupied,gunUsed:r.Has('gunUsed'),
    receipt:r.flow.log.find(e=>e.id==='frontAttackRepelled')};
 });
 assert.deepEqual([optional.before,optional.after,optional.mounted,optional.gunUsed],[false,true,0,false]);
 await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(5));
 const sortie=await page.evaluate(async()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),{FRONT_SORTIE:R}=await import('./Data_FirstLevelFrontRoute.mjs');
  const point=g.player.position.clone();g.player.position.set(R.bundle.x,g.battlefield.GroundHeight(R.bundle.x,R.bundle.z),R.bundle.z);
  r.UpdateSortie();const shortcut=r.Has('bundleRouteTraversed');
  const leader=r.squad.find(a=>a.castId==='luo');r.UpdateSquad();
  const catchupSpeed=leader.scriptMoveSpeedMps;g.player.position.copy(point);
  g.player.SetStance('prone');g.player.body.SetSize(.42,.58);
  let reached=0;
  for(const target of R.route){
    for(let frame=0;frame<1800;frame++){
      r.UpdateSortie();const p=g.player.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
      if(d<.2){reached++;break;}
      g.player.body.Move(dx/d*Math.min(.06,d),-.05,dz/d*Math.min(.06,d));g.player.position.copy(g.player.body.position);
    }
  }
  r.UpdateSortie();
  const facts=[...r.flow.facts].filter(f=>f.startsWith('bundle'));
  return {shortcut,catchupSpeed,reached,expected:R.route.length,facts,keeper:!!r.bundleKeeper,keeperAt:r.bundleKeeper?.position.toArray(),
    helpers:r.squad.filter(a=>a.missionSortie).map(a=>a.castId)};
 });
 assert.equal(sortie.shortcut,false);assert.equal(sortie.reached,sortie.expected);
 assert.ok(sortie.catchupSpeed>0,'a leader behind the player catches up instead of waiting forever');
 assert.ok(sortie.facts.includes('bundleRouteTraversed'));assert.ok(sortie.keeper);assert.deepEqual(sortie.helpers,['luo']);
 const fireWindows=await page.evaluate(()=>{
  const r=window.Tengxian.Debug.FirstLevelMissionRuntime();
  return ['moving','halted','immobilized'].map(mode=>{
    // Exercise the production targeting/cadence method without spending live
    // ammunition or damaging the traversal fixture's surviving actors.
    const sample=Object.create(r),position=r.Point({x:35,z:-180}),eye=position.clone();eye.y+=1.62;
    sample.player={position,EyePosition:eye,Alive:true};sample.squad=[];sample.frontDefenders=[];sample.guards=[];
    sample.time=100;sample.delta=.1;sample.tankDust=null;sample.BlocksSight=()=>false;sample.Has=()=>true;
    sample.tank={active:true,immobilized:mode==='immobilized',x:35,z:-160,advanceTime:mode==='halted'?12:.4,
      hullYaw:0,turretYaw:0,targetId:'player',targetAcquiredAt:0,lastShell:0,lastMg:0,shots:0,mgShots:0};
    sample.view={TankMuzzle:tank=>{const p=r.Point(tank);p.y+=1.7;return p;}};
    sample.vfx={SmokeSource:()=>0,MoveSmokeSource(){},RemoveSmokeSource(){},MuzzleFlash(){}};
    let cannon=0,mg=0;sample.combat={FireShell(){cannon++;}};sample.FireVehicleBullet=()=>{mg++;};
    sample.UpdateTank();return {mode,moving:sample.tank.moving,cannon,mg};
  });
 });
 assert.deepEqual(fireWindows,[{mode:'moving',moving:true,cannon:0,mg:1},{mode:'halted',moving:false,cannon:1,mg:0},
   {mode:'immobilized',moving:false,cannon:1,mg:1}],'sortie fire alternates while mobile and retains both weapons after track loss');
 await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(6));
 const arrival=await page.evaluate(()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();g.audio.voiceMute=true;
  const health=r.column.litters.map(l=>({id:l.id,health:l.health,bearers:[...l.bearers]}));
  for(let i=0;i<6000 && r.flow.stage.id==='Orders';i++)g.StepFrames(1,1/60,false);
  const started={stage:r.flow.stage.id,control:r.controls?.kind};
  g.StepFrames(150,1/60,false);
  return {health,started,stage:r.flow.stage.id,control:r.controls?.kind,opacity:document.querySelector('#firstLevelSouthTransition').style.opacity};
 });
 assert.equal(arrival.started.stage,'South');assert.equal(arrival.control,'southTransition');assert.equal(arrival.opacity,'1');
 await page.evaluate(()=>window.Tengxian.StepFrames(1,1/60,true));
 await page.screenshot({path:path.join(out,'Scene_SouthBlackout.png')});
 const end=await page.evaluate(()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();g.StepFrames(250,1/60,false);
  return {stage:r.flow.stage.id,control:r.controls?.kind||null,position:g.player.position.toArray(),
    health:r.column.litters.map(l=>({id:l.id,health:l.health,bearers:[...l.bearers]})),
    facts:[...r.flow.facts],hidden:document.querySelector('#firstLevelSouthTransition').style.display};
 });
 assert.equal(end.stage,'Village');assert.equal(end.control,null);assert.equal(end.hidden,'none');
 assert.ok(Math.hypot(end.position[0]-55,end.position[2]+20)<1);assert.deepEqual(end.health,arrival.health);
 assert.ok(end.facts.includes('southTransitionComplete') && !end.facts.includes('deathSceneComplete'));
 await fs.writeFile(path.join(out,'Data_RuntimeFixtures.json'),JSON.stringify({optional,sortie,fireWindows,arrival,end},null,2));
 assert.deepEqual(errors,[]);
 console.log('PASS physical sortie, optional weapon, route facts, supply NPC and escort fade with preserved casualties');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
