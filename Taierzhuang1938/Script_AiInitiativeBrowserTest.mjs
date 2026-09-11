// Controlled combat fixtures exercising the production brain, locomotion and
// melee director. Normal campaign continuity is verified separately.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`);
 await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:240000});
 const result=await page.evaluate(async()=>{
  const g=window.Tengxian,T=await import('three');
  const {AiDirector}=await import('./Script_Ai.mjs');
  const {MeleeCombatDirector}=await import('./Script_MeleeCombat.mjs');
  const {COVER_CYCLE}=await import('./Data_Tuning_AiCover.mjs');
  const rows={};
  const Harness=()=>{
   const battlefield={covers:[],objectives:[],GroundHeight:()=>0,StandHeight:()=>0,NearbyColliders:()=>[],Raycast:()=>null};
   const ai=new AiDirector({battlefield,scene:new T.Scene(),actorFactory:g.actorFactory,player:null},{seed:817});
   const Spawn=(side,x,z)=>{
    const s=ai.Spawn(side,x,z,{weapon:'Type38',squadId:'Initiative'});
    s.actor.root.visible=false;s.order='hold';s.manualGoalUntil=Infinity;
    s.holdZone={x,z,radius:2};s.tacticalRadiusM=14;s.tacticalRole='rifleman';
    return s;
   };
   return {ai,Spawn};
  };
  const Know=(s,enemy)=>{
   s.target={id:enemy.id,ref:enemy,position:enemy.position,isPlayer:false,stance:0};
   s.targetVisible=true;s.targetFromMemory=false;s.lkp=enemy.position.clone();s.lkpConfidence=1;s.alert='engaged';
  };
  const Candidate=(id,x,z,blocked=true)=>({cover:{id,x,z,height:1.2,nx:0,nz:1},
   hidePos:{x,z:z+.65},firePos:{x,z:z+.45},side:'over',hideStance:1,fireStance:0,
   validated:true,blockedCrouched:blocked,blockedStanding:false});
  {
   const {ai,Spawn}=Harness(),s=Spawn('ija',0,0),enemy=Spawn('nra',0,-30);Know(s,enemy);
   const cover=Candidate('shelter',4,-4);ai.WriteCover(s,cover,0);
   s.state='suppressed';s.suppression=.95;s.stance=2;
   ai.UpdateMoveOrder(s,null);
   const before=s.position.clone();
   for(let i=0;i<90;i++){ai.time+=1/60;ai.Act(s,1/60,null)}
   rows.pinned={moved:before.distanceTo(s.position),shots:s.fireSequence,stance:s.stance};
   ai.Dispose();
  }
  {
   const {ai,Spawn}=Harness(),s=Spawn('ija',0,0),enemy=Spawn('nra',0,-30);enemy.dummy=true;Know(s,enemy);
   const cover=Candidate('bound',4,-4);ai.covers.Query=()=>[cover];ai.covers.index.set('bound',cover.cover);
   s.task={kind:'bound',point:null,until:100,towardX:0,towardZ:-1};
   const before=s.position.clone(),states=new Set();
   for(let i=0;i<120;i++){
    ai.time+=1/60;
    if(i%6===0)ai.Think(s,.1,null);
    states.add(s.state);ai.Act(s,1/60,null);
   }
   rows.bound={states:[...states],moved:before.distanceTo(s.position),position:s.position.toArray()};
   // A cover that validates as exposed is rejected; an unreachable preferred
   // point is temporarily blacklisted and a different shelter is selected.
   ai.ReleaseCover(s);ai.covers.Query=()=>[Candidate('exposed',1,-1,false)];s.coverPickAt=-99;
   Know(s,enemy);ai.UpdateCover(s);rows.exposedRejected=!s.cover;
   const untested=Candidate('untested',1,-1,false);untested.validated=false;
   ai.covers.Query=()=>[untested];s.coverPickAt=-99;ai.UpdateCover(s);
   rows.untestedRejected=!s.cover&&untested.validated;
   const blocked=Candidate('stuck',4,-4),backup=Candidate('backup',-3,-3);
   ai.covers.Query=()=>[blocked,backup];ai.covers.index.set('stuck',blocked.cover);ai.covers.index.set('backup',backup.cover);
   ai.WriteCover(s,blocked,ai.time);s.coverPhase='approach';s.coverProgressM=Infinity;
   ai.UpdateCover(s);ai.time+=COVER_CYCLE.stalledApproachS+.1;ai.UpdateCover(s);
   rows.stuck={failed:s.failedCoverId,next:s.cover?.id};ai.Dispose();
  }
  {
   const {ai,Spawn}=Harness(),s=Spawn('ija',0,0),enemy=Spawn('nra',0,-9);
   enemy.dummy=true;enemy.scriptedNoncombatant=true;s.squadMateCount=1;Know(s,enemy);
   const melee=new MeleeCombatDirector({Soldiers:()=>ai.soldiers,Weapon:e=>e.bayonetFixed?'Bayonet':null,
    Move:(e,dx,dz)=>ai.StepBody(e,dx,dz,1/60),LineClear:()=>true,
    Damage:(target,attacker,amount)=>target.TakeHit(amount,'torso',new T.Vector3().subVectors(target.position,attacker.position).normalize())});
   ai.ctx.meleeCombat=melee;
   const before=s.position.clone();let charged=false,managed=false;
   for(let i=0;i<720&&enemy.alive;i++){
    ai.time+=1/60;
    if(i%6===0&&!s.meleeCombat){Know(s,enemy);ai.Think(s,.1,null)}
    charged||=s.state==='charge';melee.Update(1/60);managed||=!!s.meleeCombat;
    ai.Act(s,1/60,null);
   }
   rows.charge={charged,managed,moved:before.distanceTo(s.position),enemyHealth:enemy.health,
    attacks:melee.stats.attacks,hits:melee.stats.hits,events:melee.events.slice(-12)};
   // Loss of sight may keep only the recorded position, not a live transform.
   s.meleeCombat=null;s.state='charge';s.autoChargeTarget=enemy.id;s.autoChargeUntil=ai.time+4;
   s.targetVisible=false;s.targetFromMemory=true;s.targetLostTime=2;s.lkp.set(0,0,-9);
   enemy.position.set(50,0,50);
   rows.lostCharge={point:{...ai.ChargePoint(s,false)},continues:ai.UpdateChargeIntent(s)};
   ai.Dispose();
  }
  {
   const {FirstLevelMissionRuntime}=await import('./Script_FirstLevelMissionRuntime.mjs');
   const {MISSION_TUNING:R}=await import('./Data_Tuning_FirstLevel.mjs');
   const {ai,Spawn}=Harness(),s=Spawn('nra',0,0),enemy=Spawn('ija',0,-8);Know(s,enemy);
   s.p012Guided=true;s.scriptMoveSpeedMps=3;s.scriptedNoncombatant=false;
   const runtime=Object.assign(Object.create(FirstLevelMissionRuntime.prototype),{ai,time:0,trainWounded:null});
   const entered=runtime.RespondToContact(s);
   const defended=!!s.missionContactPost&&!s.p012Guided&&s.order==='hold';
   runtime.time=R.contactMaxHoldS+.1;
   rows.guideContact={entered,defended,exited:!runtime.RespondToContact(s),
    resumed:!s.missionContactPost&&s.missionContactResumeAt>runtime.time};
   ai.Dispose();
  }
  return rows;
 });
 await fs.mkdir(path.join(project,'_shots','AiInitiative'),{recursive:true});
 await fs.writeFile(path.join(project,'_shots','AiInitiative','Data_Initiative.json'),JSON.stringify({result,errors},null,2));
 console.log(JSON.stringify(result));
 assert.ok(Object.values(result.guideContact).every(Boolean),'visible close contact yields the guide route to combat, then releases it on the real finite timer');
 assert.ok(result.pinned.moved>.5,'heavily suppressed soldier crawls toward shelter');
 assert.equal(result.pinned.shots,0,'heavy suppression does not fire while escaping');
 assert.ok(result.bound.states.includes('bound')&&result.bound.moved>2,'direction-only bound reaches actual locomotion');
 assert.ok(result.untestedRejected,'untested runner-up must pass real validation before ownership');
 assert.ok(result.exposedRejected,'failed cover validation cannot be mistaken for protection');
 assert.deepEqual(result.stuck,{failed:'stuck',next:'backup'},'unreachable cover is abandoned for a different point');
 assert.ok(result.charge.charged&&result.charge.managed&&result.charge.moved>3,'charge moves and hands off to shared melee');
 assert.ok(result.charge.attacks>0&&result.charge.hits>0&&result.charge.enemyHealth<100,'bayonet inflicts damage through shared contact rules');
 assert.equal(result.lostCharge.continues,false,'losing the opponent ends a charge');
 assert.equal(result.lostCharge.point.z,-9,'charge destination uses the last sighting');
 assert.deepEqual(errors,[]);
 console.log('ok initiative: hide, bound, replace failed cover, charge, real bayonet contact, lost-target cancellation');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
