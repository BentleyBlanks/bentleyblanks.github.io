// Targeted physical fixture; the separate campaign driver validates mission causality.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'Taierzhuang1938/_shots/TrenchCover');await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],trace=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});
 await page.evaluate(async()=>{
  const g=window.Tengxian;await g.Debug.FirstLevelJump(4);
  const r=g.Debug.FirstLevelMissionRuntime(),{MISSION_ROUTES}=await import('./Data_FirstLevelMissionLayout.mjs');
  for(const s of [...g.ai.soldiers])if(!r.squad.includes(s))g.ai.Remove(s);
  r.enemies.clear();r.spawnQueue=[];
  r.Update=function(dt){this.delta=dt;this.time+=dt;this.UpdateSquad();};
  r.squad.forEach((s,i)=>{r.PlaceActor(s,{x:-24+(i%2?.45:-.45),z:-25+Math.floor(i/2)*2});s.target=null;s.suppression=0;s.incomingFire=null;s.missionDangerUntil=0;});
  // No enemies in this fixture: hold the drill on, then test the calm walk last.
  const {SquadCoverThreat}=await import('./Script_SquadMarchCover.mjs');r.squadCoverThreat=new SquadCoverThreat();r.squadCoverThreat.forced=true;
  g.player.Spawn(-24,-28,0);r.Guide(MISSION_ROUTES.support);
  const {OPENING}=await import('./Data_FirstLevelOpening.mjs');
  r.squad.forEach((s,i)=>{const end=r.squadRoutes.get(s.id).at(-1),post=OPENING.frontPosts[i];
   if(Math.hypot(end.x-post.x,end.z-post.z)>.01)throw new Error('Bounds must retain the authored front post');});
 });
 const Sample=async(label,frames=120)=>{
  const sample=await page.evaluate(({label,frames})=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();g.StepFrames(frames,1/60,false);
   return {label,time:r.time,released:[...r.squadCoverBounds.released],members:r.squad.map(s=>({id:s.castId,p:{...s.position},stance:s.stance,yaw:s.yaw,waiting:s.missionCoverWaiting,passed:s.missionCoverPassed,goal:r.squadRoutes.get(s.id)?.[0],command:s.squadMarchCommand?.status,actualGoal:{...s.goal},speed:s.moveSpeed,arrival:s.scriptArrivalRadius}))};},{label,frames});trace.push(sample);return sample;
 };
 let settled;
 for(let i=0;i<50;i++){settled=await Sample('player-behind');if(settled.members.every(m=>m.waiting))break;}
 console.log('sheltered',JSON.stringify(settled));
 assert.ok(settled.members.every(m=>m.waiting),'all four physically reach their first two shelters');
 assert.deepEqual(settled.released,[],'player behind prevents early release');
 const shields=await page.evaluate(()=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();return r.squad.map(s=>{
  const at=s.position,eye=at.clone().setY(at.y+.85),north=eye.clone().setZ(at.z-8);
  return r.BlocksSight(north,eye);
 });});assert.ok(shields.every(Boolean),'real front faces intercept incoming fire at every crouched torso');
 const held=await Sample('hold',180);assert.ok(held.members.every((m,i)=>Math.hypot(m.p.x-settled.members[i].p.x,m.p.z-settled.members[i].p.z)<.25),'real crouched wait stays behind cover');
 assert.ok(held.members.every(m=>Math.abs(Math.atan2(Math.sin(m.yaw),Math.cos(m.yaw)))<.15),'idle guards face the trench ahead rather than their side wall');
 await page.evaluate(()=>{const g=window.Tengxian;g.player.Spawn(-24,-30,0);g.player.pitch=-.08;g.StepFrames(2,1/60,true);});
 await page.screenshot({path:path.join(out,'Scene_TrenchCoverWait.png')});
 await page.evaluate(()=>window.Tengxian.player.Spawn(-24,-37,0));
 const advance=await Sample('first-pair-release',180);
 assert.deepEqual(advance.released,[0]);assert.ok(advance.members.filter((_,i)=>i%2===1).every(m=>m.waiting),'second pair covers while the first advances');
 await page.evaluate(()=>window.Tengxian.player.Spawn(-24,-51,0));
 let next;
 for(let i=0;i<65;i++){next=await Sample('second-bound');if(next.released.includes(1))break;}
 console.log('next-bound',JSON.stringify(next));assert.ok(next.released.includes(1),'covering pair resumes after player and forward pair arrive');
 await page.evaluate(()=>{const g=window.Tengxian;g.player.Spawn(-8,-80,0);g.StepFrames(2,1/60,true);});
 await page.screenshot({path:path.join(out,'Scene_TrenchCoverAdvance.png')});
 for(const [index,x,z] of [[2,-8,-88],[3,-8,-106]]){
  await page.evaluate(({x,z})=>window.Tengxian.player.Spawn(x,z,0),{x,z});
  let state;for(let i=0;i<60;i++){state=await Sample('release-'+index);if(state.released.includes(index))break;}
  assert.ok(state.released.includes(index),'last shelters release without waiting for a nonexistent next team');
 }
 await page.evaluate(async()=>{const r=window.Tengxian.Debug.FirstLevelMissionRuntime(),{MISSION_ROUTES}=await import('./Data_FirstLevelMissionLayout.mjs');
  // Calm: no contact means no shelter detours and no player gate, even with the player behind.
  // Single file: side by side 0.9 m apart in a trench is a crowd deadlock of its own.
  r.squad.forEach((s,i)=>r.PlaceActor(s,{x:-24,z:-31+i*1.9}));
  window.Tengxian.player.Spawn(-24,-22,0);r.squadCoverThreat.forced=null;r.squadRoutes.clear();r.Guide(MISSION_ROUTES.support);
  if(!r.squad.every(s=>r.squadRoutes.get(s.id).some(p=>Number.isInteger(p.coverBound))))throw new Error('Support route should still carry optional posts');
  let waited=false;
  for(let i=0;i<40&&!r.squad.every(s=>s.position.z<-52);i++){window.Tengxian.StepFrames(60,1/60,false);waited||=r.squad.some(s=>s.missionCoverWaiting);}
  if(!r.squadCoverCalm)throw new Error('Fixture without enemies should be calm');
  if(waited)throw new Error('Calm squad must not wait at shelters');
  if(!r.squad.every(s=>s.position.z<-52))throw new Error('Calm squad walks past both first shelters: '+JSON.stringify({march:r.squadMarch?.Snapshot?.().waiting,m:r.squad.map(s=>({p:s.position,r:r.squadRoutes.get(s.id).slice(0,3),cmd:s.squadMarchCommand,cp:s.missionContactPost,st:s.state,goal:s.goal,sp:s.moveSpeed,sup:s.suppression}))}));
  r.Guide(MISSION_ROUTES.south);
  if([...r.squadRoutes.values()].flat().some(p=>Number.isInteger(p.coverBound)))throw new Error('A stage change must remove obsolete cover gates');
 });
 assert.deepEqual(errors,[]);
 console.log('ok real four-man cover waits, stable crouch, alternating movement and player-triggered continuation at 1280x720');
}finally{await fs.writeFile(path.join(out,'Data_TrenchCoverTrace.json'),JSON.stringify({trace,errors},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
