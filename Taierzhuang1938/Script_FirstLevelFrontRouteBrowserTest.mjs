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
 // Drive the actual leader's Think/Act, mission orders and Rapier body. Only
 // the player's pacing signal and incoming-fire notifications are scripted;
 // the leader is never placed/teleported or moved by this fixture.
 const leader=await page.evaluate(async()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),ai=r.ai,s=r.squad.find(a=>a.castId==='luo');
  const {FRONT_SORTIE:R}=await import('./Data_FirstLevelFrontRoute.mjs');
  const {MISSION_ROUTES}=await import('./Data_FirstLevelMissionLayout.mjs');
  const {PerspectiveCamera}=await import('three');
  const receipt={id:s.id,cast:s.castId,legs:[],passages:[],invalidPostures:[],contactFrames:0,wait:null,catchup:null};
  let imageTaken=false;
  const Tick=(follow=true)=>{
   if(follow){g.player.position.copy(s.position);g.player.position.x+=1;}
   r.time+=1/30;r.delta=1/30;ai.time+=1/30;ai.tickIndex++;
   // Reproduce the continuous fire that previously requested a standing escape
   // capsule at the low roof, despite the mission reporting a prone stance.
   if(R.crawl.some(c=>Math.hypot(s.position.x-c.x,s.position.z-c.z)<10))
    s.incomingFire={at:ai.time,position:s.position.clone()};
   if(ai.tickIndex%6===0)ai.Think(s,1/5,g.player);
   ai.Act(s,1/30,g.player);g.physics.Step(1/30);r.UpdateSquad();
   if(s.missionContactPost)receipt.contactFrames++;
  };
  for(const reverse of [false,true]){
   if(reverse){r.Record('bundleTaken');r.GuideSortie(MISSION_ROUTES.bundleReturn);}
   const planned=r.squadRoutes.get(s.id).map(p=>({...p})),reached=[],crossed=new Set(),start=r.time;
   let frame=0;
   for(;frame<15000&&r.squadRoutes.get(s.id).length;frame++){
    const before=[...r.squadRoutes.get(s.id)];Tick();
    const removed=before.length-r.squadRoutes.get(s.id).length;
    for(const point of before.slice(0,removed))reached.push({x:point.x,z:point.z,distance:Math.hypot(s.position.x-point.x,s.position.z-point.z)});
    for(const c of R.crawl){
     if(Math.abs(s.position.x-c.x)>c.w/2||Math.abs(s.position.z-c.z)>c.d/2-.5)continue;
     if(s.stance!==2||s.body.height>.6)receipt.invalidPostures.push({reverse,id:c.id,stance:s.stance,height:s.body.height});
     if(!crossed.has(c.id)){
      crossed.add(c.id);receipt.passages.push({reverse,id:c.id,position:s.position.toArray(),height:s.body.height});
      // A forced combat rise must also respect the passage constraint.
      ai.SetStance(s,0,.5,true);
      if(s.stance!==2)receipt.invalidPostures.push({reverse,id:c.id,forcedRise:s.stance});
     }
     if(!imageTaken){
      const camera=new PerspectiveCamera(58,1280/720,.1,900);
      camera.position.set(c.x+1.2,s.position.y+1.1,c.z+5);camera.lookAt(s.position.x,s.position.y+.35,s.position.z);camera.updateMatrixWorld(true);
      ai.CullActors(camera);
      // Restore this camera's real detail rig after the fixture's offscreen
      // simulation; submit its normal animated pose before taking the image.
      for(let i=0;i<6;i++)Tick();
      g.scene.updateMatrixWorld(true);document.querySelector('#hud').style.visibility='hidden';
      g.renderer.setRenderTarget(null);g.renderer.clear();g.renderer.render(g.scene,camera);
      imageTaken=true;
     }
    }
    if(!reverse&&!receipt.wait&&s.position.x>40&&s.position.z>-120){
     g.player.position.set(R.route[0].x,0,R.route[0].z);r.UpdateSquad();
     const from=s.position.clone();for(let i=0;i<60;i++)Tick(false);
     receipt.wait={speed:s.scriptMoveSpeedMps,distance:Math.hypot(s.position.x-from.x,s.position.z-from.z)};
     g.player.position.set(R.house.x,0,R.house.z);r.UpdateSquad();
     const back=s.position.clone();for(let i=0;i<30;i++)Tick(false);
     receipt.catchup={speed:s.scriptMoveSpeedMps,distance:Math.hypot(s.position.x-back.x,s.position.z-back.z)};
    }
   }
   receipt.legs.push({reverse,planned:planned.length,reached,frames:frame,seconds:r.time-start,remaining:r.squadRoutes.get(s.id),position:s.position.toArray()});
   if(r.squadRoutes.get(s.id).length)break;
  }
  receipt.constraintReleased=s.scriptTraversalStance==null;
  return receipt;
 });
 await page.screenshot({path:path.join(out,'Scene_LeaderCrawling.png')});
 await page.evaluate(()=>document.querySelector('#hud').style.visibility='');
 await fs.writeFile(path.join(out,'Data_LeaderRoute.json'),JSON.stringify(leader,null,2));
 assert.equal(leader.legs.length,2,'leader physically completes both route directions');
 for(const leg of leader.legs){
  assert.equal(leg.remaining.length,0,'leader cannot stall: '+JSON.stringify(leg));
  assert.equal(leg.reached.length,leg.planned,'every queued bend is reached');
  assert.ok(leg.reached.every(p=>p.distance<.8),'waypoints consumed only on physical arrival');
 }
 assert.equal(leader.passages.length,4,'both low passages are crossed in both directions');
 assert.deepEqual(leader.invalidPostures,[],'combat cannot raise the capsule under a roof');
 assert.ok(leader.contactFrames>0,'ordinary contact response remains active outside the passages');
 assert.ok(leader.wait.speed===0&&leader.wait.distance<.1,'leader waits for the trailing player');
 assert.ok(leader.catchup.speed>0&&leader.catchup.distance>.5,'leader resumes when the player advances');
 assert.ok(leader.constraintReleased,'clearance constraint is released outside the passage');
 const medicine=await page.evaluate(async()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),{MISSION_TUNING:R}=await import('./Data_FirstLevelMission.mjs');
  const supply=g.interact.points.get('MissionBundle');
  // Isolate the real supply callback from combat to test inventory contracts;
  // the normal campaign separately exercises F at this exact physical crate.
  g.player.bandages=0;g.player.health=50;g.player.bleeding=1;g.state.bundles=0;
  const enabled=supply.Enabled();supply.OnComplete();
  const first={health:g.player.health,bleeding:g.player.bleeding,bandages:g.player.bandages,bundles:g.state.bundles};
  supply.OnComplete();const repeated={bandages:g.player.bandages,bundles:g.state.bundles};
  const bandaged=g.player.Bandage(),afterBandage={bleeding:g.player.bleeding,bandages:g.player.bandages,health:g.player.health};
  r.ContinueCheckpoint();const afterRetry={bandages:g.player.bandages,bundles:g.state.bundles};
  supply.OnComplete();const restocked={bandages:g.player.bandages,bundles:g.state.bundles};
  return {enabled,reserve:R.bundleSupplyBandages,bundleReserve:R.bundleSupplyCount,first,repeated,bandaged,afterBandage,afterRetry,restocked};
 });
 assert.equal(medicine.enabled,true);
 assert.deepEqual(medicine.first,{health:50,bleeding:1,bandages:medicine.reserve,bundles:medicine.bundleReserve},'pickup supplies dressings without healing or stopping blood loss');
 assert.deepEqual(medicine.repeated,{bandages:medicine.reserve,bundles:medicine.bundleReserve},'repeated pickup cannot stack supplies past the reserve');
 assert.equal(medicine.bandaged,true);
 assert.deepEqual(medicine.afterBandage,{health:50,bleeding:0,bandages:medicine.reserve-1},'the player still spends a dressing to stop bleeding');
 assert.deepEqual(medicine.afterRetry,{bandages:medicine.reserve-1,bundles:medicine.bundleReserve},'checkpoint retry does not grant medicine');
 assert.deepEqual(medicine.restocked,{bandages:medicine.reserve,bundles:medicine.bundleReserve},'using the actual depot after a retry replenishes missing dressings');
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
 await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(12));
 const supplyReach=await page.evaluate(()=>{
  const g=window.Tengxian,point=g.interact.points.get('MissionSupplyTransfer');
  g.player.SetStance('crouch');
  const Put=(x,z)=>{g.player.body.Teleport(x,g.battlefield.GroundHeight(x,z)+.02,z);g.player.position.copy(g.player.body.position);};
  Put(95.7126067485884,110.05628916683018);
  const failedReach=g.interact.Reach(point,g.player);
  // The new endpoint plus the unchanged 0.8 m route tolerance stays in range
  // even when approached from the far side of the actual crate.
  Put(94.5+.799,110);
  const correctedReach=g.interact.Reach(point,g.player),query=g.interact.Query(g.player);
  const before={count:point.count,bandages:g.player.bandages};
  g.Debug.Key('KeyF',true);g.StepFrames(90,1/60,false);g.Debug.Key('KeyF',false);
  return {failedReach,correctedReach,kind:query?.kind,id:query?.point?.id,before,
    after:{count:point.count,bandages:g.player.bandages}};
 });
 assert.equal(supplyReach.failedReach,null,'the observed failed stop is outside the real crate reach');
 assert.ok(supplyReach.correctedReach<2.5);
 assert.equal(supplyReach.kind,'supply');assert.equal(supplyReach.id,'MissionSupplyTransfer');
 assert.deepEqual(supplyReach.after,{count:supplyReach.before.count+1,bandages:supplyReach.before.bandages+1},
  'F completes the real transfer supply from the corrected worst-case route stop');
 await fs.writeFile(path.join(out,'Data_RuntimeFixtures.json'),JSON.stringify({optional,sortie,medicine,fireWindows,arrival,end,supplyReach},null,2));
 assert.deepEqual(errors,[]);
 console.log('PASS physical sortie, optional weapon, route facts, supply NPC and escort fade with preserved casualties');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
