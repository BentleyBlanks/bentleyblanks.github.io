// Targeted physical fixture; the separate campaign driver validates mission causality.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'Taierzhuang1938/_shots/TrenchCover');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],trace=[];
page.on('pageerror',error=>errors.push(String(error)));

try{
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high`,
    {waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});

  // Keep the full shared cover drill on the approach route, where all three
  // retained shelters are physically connected to the capsule-clear trench.
  const approach=await page.evaluate(async()=>{
    const g=window.Tengxian;await g.Debug.FirstLevelJump(4);
    const r=g.Debug.FirstLevelMissionRuntime(),
      {OPENING}=await import('./Data_FirstLevelOpening.mjs'),
      {SquadCoverThreat}=await import('./Script_SquadMarchCover.mjs');
    for(const soldier of [...g.ai.soldiers])if(!r.squad.includes(soldier))g.ai.Remove(soldier);
    r.enemies.clear();r.spawnQueue=[];
    r.Update=function(dt){this.delta=dt;this.time+=dt;this.UpdateSquad();};
    r.squad.forEach((soldier,index)=>{
      r.PlaceActor(soldier,{x:-66+(index%2?.45:-.45),z:68+Math.floor(index/2)*1.9});
      soldier.target=null;soldier.suppression=0;soldier.incomingFire=null;soldier.missionDangerUntil=0;
    });
    r.squadRoutes.clear();
    r.squadCoverThreat=new SquadCoverThreat();r.squadCoverThreat.forced=true;
    g.player.Spawn(-66,72,0);
    r.Guide(OPENING.approachRoute,{resumeAfter:OPENING.trenchEntry});
    return {hasBounds:!!r.squadCoverBounds,routes:r.squad.map((soldier,index)=>({index,
      bounds:soldier.missionCoverBounds.map(point=>({...point})),
      route:r.squadRoutes.get(soldier.id).map(point=>({...point}))}))};
  });
  assert.equal(approach.hasBounds,true,'approach route owns the real cover-bound controller');
  assert.deepEqual(approach.routes.map(member=>member.bounds.map(point=>point.coverBound)),[[0,2],[1],[0,2],[1]],
    'four members alternate across the three real approach shelters');

  const Sample=async(label,frames=120)=>{
    const sample=await page.evaluate(({label,frames})=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();g.StepFrames(frames,1/60,false);
      return {label,time:r.time,released:[...r.squadCoverBounds.released],members:r.squad.map(soldier=>({
        id:soldier.castId,p:{...soldier.position},stance:soldier.stance,yaw:soldier.yaw,
        waiting:soldier.missionCoverWaiting,passed:soldier.missionCoverPassed,
        goal:r.squadRoutes.get(soldier.id)?.[0],command:soldier.squadMarchCommand?.status,
        actualGoal:{...soldier.goal},speed:soldier.moveSpeed,arrival:soldier.scriptArrivalRadius}))};
    },{label,frames});
    trace.push(sample);return sample;
  };

  let settled;
  for(let i=0;i<70;i++){
    settled=await Sample('approach-player-behind');
    if(settled.members.every(member=>member.waiting))break;
  }
  assert.ok(settled.members.every(member=>member.waiting),'all four physically reach their alternating shelters');
  assert.deepEqual(settled.released,[],'player behind prevents early release');
  const shields=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    return r.squad.map(soldier=>{
      const eye=soldier.position.clone().setY(soldier.position.y+.85),ahead=eye.clone().setZ(soldier.position.z-8);
      return r.BlocksSight(ahead,eye);
    });
  });
  assert.ok(shields.every(Boolean),'real shelter faces intercept fire at every crouched torso');
  const held=await Sample('approach-stable-hold',180);
  assert.ok(held.members.every((member,index)=>Math.hypot(member.p.x-settled.members[index].p.x,
    member.p.z-settled.members[index].p.z)<.25),'crouched cover wait stays physically stable');
  assert.ok(held.members.every(member=>Math.abs(Math.atan2(Math.sin(member.yaw),Math.cos(member.yaw)))<.15),
    'idle guards face down the trench rather than into a side wall');
  await page.evaluate(()=>{const g=window.Tengxian;g.player.Spawn(-37,15,0);g.player.pitch=-.08;g.StepFrames(2,1/60,true);});
  await page.screenshot({path:path.join(out,'Scene_TrenchCoverWait.png')});

  // A covering member evading a grenade cannot release the forward pair.
  await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    g.player.Spawn(-37,11,0);
    const covering=r.squad.find(soldier=>soldier.missionCoverBounds.some(point=>point.coverBound===1));
    covering.evading=true;
  });
  const interrupted=await Sample('approach-grenade-interruption',120);
  assert.deepEqual(interrupted.released,[],'grenade evasion interrupts the covering pair');
  await page.evaluate(()=>{
    const r=window.Tengxian.Debug.FirstLevelMissionRuntime();
    for(const soldier of r.squad)soldier.evading=false;
  });
  let first;
  for(let i=0;i<10;i++){first=await Sample('approach-first-pair-release');if(first.released.includes(0))break;}
  assert.ok(first.released.includes(0),'player progress releases the first pair after cover resumes');
  assert.ok(first.members.filter((_,index)=>index%2===1).every(member=>member.waiting),
    'second pair keeps covering while the first advances');

  await page.evaluate(()=>window.Tengxian.player.Spawn(-45,-3,0));
  let second;
  for(let i=0;i<70;i++){second=await Sample('approach-second-bound');if(second.released.includes(1))break;}
  assert.ok(second.released.includes(1),'covering pair resumes after player and forward pair arrive');
  await page.evaluate(()=>{const g=window.Tengxian;g.player.Spawn(-43,-8,0);g.StepFrames(2,1/60,true);});
  await page.screenshot({path:path.join(out,'Scene_TrenchCoverAdvance.png')});
  await page.evaluate(()=>window.Tengxian.player.Spawn(-45,-12,0));
  let final;
  for(let i=0;i<70;i++){final=await Sample('approach-final-release');if(final.released.includes(2))break;}
  assert.ok(final.released.includes(2),'last shelter releases without a nonexistent next team');

  // Calm movement retains the optional shelter points but skips every gate.
  const calm=await page.evaluate(async()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),{OPENING}=await import('./Data_FirstLevelOpening.mjs');
    r.squad.forEach((soldier,index)=>r.PlaceActor(soldier,{x:-66,z:68+index*1.9}));
    g.player.Spawn(-66,72,0);r.squadCoverThreat.forced=false;r.squadRoutes.clear();
    r.Guide(OPENING.approachRoute,{resumeAfter:OPENING.trenchEntry});
    const hasPosts=r.squad.every(soldier=>r.squadRoutes.get(soldier.id).some(point=>Number.isInteger(point.coverBound)));
    let waited=false;
    for(let i=0;i<90&&!r.squad.every(soldier=>(r.squadRoutes.get(soldier.id)?.length??0)===0);i++){
      g.StepFrames(60,1/60,false);waited||=r.squad.some(soldier=>soldier.missionCoverWaiting);
    }
    return {hasPosts,waited,coverCalm:r.squadCoverCalm,
      finished:r.squad.every(soldier=>(r.squadRoutes.get(soldier.id)?.length??0)===0)};
  });
  assert.ok(calm.hasPosts,'calm approach still carries optional physical shelter posts');
  assert.ok(calm.coverCalm&&!calm.waited&&calm.finished,'calm squad walks the full approach without cover waits');

  // The rebuilt Support route deliberately has no shelter. Forced contact must
  // not synthesize gates or detours, and all four routes still end at the real
  // front posts used by the mission.
  const support=await page.evaluate(async()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),
      {MISSION_ROUTES}=await import('./Data_FirstLevelMissionLayout.mjs'),
      {OPENING}=await import('./Data_FirstLevelOpening.mjs');
    r.squad.forEach((soldier,index)=>{
      r.PlaceActor(soldier,{x:-37+(index%2?.45:-.45),z:-96+Math.floor(index/2)*1.9});
      soldier.target=null;soldier.suppression=0;soldier.incomingFire=null;soldier.missionDangerUntil=0;
    });
    r.squadCoverThreat.forced=true;r.squadRoutes.clear();
    g.player.Spawn(MISSION_ROUTES.support.at(-1).x,MISSION_ROUTES.support.at(-1).z,0);
    r.Guide(MISSION_ROUTES.support);
    const initial={hasBounds:!!r.squadCoverBounds,routes:r.squad.map((soldier,index)=>({index,
      route:r.squadRoutes.get(soldier.id).map(point=>({...point})),post:OPENING.frontPosts[index]}))};
    const samples=[];
    for(let frame=0;frame<120*60;frame++){
      g.StepFrames(1,1/60,false);
      if(frame%120===0)samples.push(r.squad.map(soldier=>({x:+soldier.position.x.toFixed(2),
        z:+soldier.position.z.toFixed(2),waiting:!!soldier.missionCoverWaiting,
        points:r.squadRoutes.get(soldier.id)?.length??0})));
      if(r.squad.every(soldier=>(r.squadRoutes.get(soldier.id)?.length??0)===0))break;
    }
    return {initial,samples,members:r.squad.map(soldier=>({x:soldier.position.x,z:soldier.position.z,
      waiting:!!soldier.missionCoverWaiting,points:r.squadRoutes.get(soldier.id)?.length??0}))};
  });
  assert.equal(support.initial.hasBounds,false,'support leg has no fictional cover-bound controller');
  for(const member of support.initial.routes){
    assert.ok(member.route.length>4,'each support member retains a rounded personal route to the front');
    assert.ok(member.route.every(point=>!Number.isInteger(point.coverBound)&&!Number.isInteger(point.coverStation)),
      'support route contains no retired shelter detour');
    assert.ok(Math.hypot(member.route.at(-1).x-member.post.x,member.route.at(-1).z-member.post.z)<.01,
      'each support route ends at its authored front post');
  }
  assert.ok(support.samples.flat().every(sample=>!sample.waiting),
    'forced contact never parks a soldier at a nonexistent support shelter');
  assert.ok(support.members.every(member=>member.points===0),
    'all four soldiers physically finish the rebuilt support route');
  await page.evaluate(()=>window.Tengxian.StepFrames(2,1/60,true));
  await page.screenshot({path:path.join(out,'Scene_TrenchSupportArrival.png')});

  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'Data_TrenchCoverTrace.json'),JSON.stringify({approach,trace,calm,support,errors},null,2));
  console.log('ok real approach cover drill and shelter-free support arrival at 1280x720');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
