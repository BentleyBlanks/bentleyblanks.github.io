// Reproduce a displaced member rejoining the authored route; this is a fixture, not a campaign clear.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'Taierzhuang1938/_shots/SquadMarch');await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});
  await page.evaluate(async()=>{
    const g=window.Tengxian;await g.Debug.FirstLevelJump(7);
    const r=g.Debug.FirstLevelMissionRuntime(),{MISSION_ROUTES}=await import('./Data_FirstLevelMissionLayout.mjs');
    Object.assign(r.tank,{x:28,z:-123,hullYaw:2.280614001652198,immobilized:true});
    r.view.Update(0,{tank:r.tank,player:g.player,camera:r.camera});
    const s=r.squad[2];r.PlaceActor(s,{x:25.809930168904387,z:-123.17752463697637});
    s.yaw=14.151511625330148;g.player.Spawn(-8,-97,0);r.Guide(MISSION_ROUTES.south);
    const before=s.body.position.clone(),actorBefore=s.position.clone();
    const probes=Array.from({length:16},(_,i)=>s.body.ProbeMove(Math.cos(i*Math.PI/8)*.65,-.01,Math.sin(i*Math.PI/8)*.65));
    if(!s.body.position.equals(before)||!s.position.equals(actorBefore))throw new Error('ProbeMove must not move actors');
    window.marchNavigationProbes=probes;
    window.marchNavigationMember=s;window.marchNavigationStart=s.position.clone();
  });
  const trace=[];
  for(let second=0;second<=60;second+=2){
    const sample=await page.evaluate(()=>{
      const g=window.Tengxian,s=window.marchNavigationMember;
      g.StepFrames(120,1/60,false);
      const r=g.Debug.FirstLevelMissionRuntime(),goal=r.squadRoutes.get(s.id)?.[0],nav={x:0,z:0};
      const steered=goal&&g.ai.ctx.nav.Steer(s.position.x,s.position.z,goal.x,goal.z,nav);
      return {time:g.ai.time,position:{...s.position},goal:{...s.goal},routeGoal:goal,
        speed:s.moveSpeed*3.6,command:s.squadMarchCommand,grounded:s.grounded,
        distance:s.position.distanceTo(g.player.position),travel:s.position.distanceTo(window.marchNavigationStart),
        steered,nav,overlap:g.physics.Overlaps(s.position.x,s.position.y+.04,s.position.z,.3,1.7),
        ground:[[-2,0],[2,0],[0,-2],[0,2]].map(([dx,dz])=>g.battlefield.GroundHeight(s.position.x+dx,s.position.z+dz))};
    });trace.push(sample);
    if(sample.distance<15)break;
  }
  await page.evaluate(()=>window.Tengxian.StepFrames(1,1/60,true));
  await page.screenshot({path:path.join(out,'Scene_SquadMarchNavigation.png')});
  const probes=await page.evaluate(()=>window.marchNavigationProbes);
  const finalProbe=await page.evaluate(()=>{const g=window.Tengxian,s=window.marchNavigationMember;return {
    radius:s.body.radius,height:s.body.height,overlap:g.physics.Overlaps(s.position.x,s.position.y,s.position.z,s.body.radius,s.body.height),
    directions:Array.from({length:16},(_,i)=>s.body.ProbeMove(Math.cos(i*Math.PI/8)*.65,-.01,Math.sin(i*Math.PI/8)*.65))};});
  await fs.writeFile(path.join(out,'Data_SquadMarchNavigation.json'),JSON.stringify({trace,probes,finalProbe,errors},null,2));
  console.log('navigation',JSON.stringify(trace.at(-1)));
  assert.ok(trace.at(-1).distance<15,'a displaced member rejoins the squad through real collision and terrain');
  assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
