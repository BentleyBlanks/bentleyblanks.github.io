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
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&missionStage=3&shot=1&manual=1&quality=low&scale=small`);
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
  {
   const {FirstLevelMissionRuntime}=await import('./Script_FirstLevelMissionRuntime.mjs');
   const {MISSION_TUNING:R}=await import('./Data_Tuning_FirstLevel.mjs');
   const {ai,Spawn}=Harness(),s=Spawn('nra',0,0),enemy=Spawn('ija',0,-50);Know(s,enemy);
   s.castId='heyoutian';s.tacticalRadiusM=0;s.targetVisible=false;s.targetFromMemory=true;
   const runtime=Object.assign(Object.create(FirstLevelMissionRuntime.prototype),{ai,time:1,trainWounded:null});
   const shelter=Candidate('companion-shelter',0,-3);
   ai.covers.Query=()=>[shelter];ai.covers.index.set(shelter.cover.id,shelter.cover);
   runtime.MoveActor(s,{x:0,z:-15});
   s.missionContactResumeAt=100; // Incoming fire must override even the forced march window.
   let held=true;const start=s.position.clone();
   for(let i=0;i<600;i++){
    ai.time+=1/60;runtime.time+=1/60;s.suppression=.7;
    if(i%6===0)held&&=runtime.RespondToContact(s);
    ai.ApplyScriptDefense(s);ai.UpdateMoveOrder(s,null);ai.Act(s,1/60,null);
   }
   rows.companionShelter={held,moved:start.distanceTo(s.position),phase:s.coverPhase,
    guided:s.p012Guided,health:s.health,shots:s.fireSequence};
   s.suppression=.3;runtime.time+=.5;ai.time+=.5;runtime.RespondToContact(s);
   rows.companionShelter.proneAfterDecay=s.stance===2;
   s.suppression=0;runtime.time+=R.companionDangerHoldS+.1;ai.time+=R.companionDangerHoldS+.1;
   rows.companionShelter.quietResumes=!runtime.RespondToContact(s);
   let peeks=false;
   for(let i=0;i<600;i++){
    ai.time+=1/60;runtime.time+=1/60;s.suppression=.3;
    if(i%6===0)runtime.RespondToContact(s);
    ai.ApplyScriptDefense(s);ai.UpdateMoveOrder(s,null);ai.Act(s,1/60,null);
    peeks||=s.coverPhase==='peek'&&s.stance===0;
   }
   rows.companionReturnFire={peeks,shots:s.fireSequence};
   // Cover ownership does not excuse walking over the parapet or through a traverse.
   const host=ai.covers.host,ground=host.GroundHeight,raycast=host.Raycast;
   host.GroundHeight=(x,z)=>z < -1 ? 2 : 0;
   s.holdZone={x:0,z:0,radius:.5};s.position.set(0,0,0);
   rows.companionParapetRejected=!ai.CoverAllowed(s,shelter);
   host.GroundHeight=ground;host.Raycast=()=>({distance:.5});
   rows.companionTraverseRejected=!ai.CoverAllowed(s,shelter);
   host.Raycast=raycast;
   rows.companionTrenchAllowed=ai.CoverAllowed(s,shelter);
   s.suppression=0;s.health=30;s.targetVisible=true;runtime.time+=10;ai.time+=10;
   ai.RememberIncomingFire(s,new T.Vector3(0,1.5,-50));
   rows.companionBriefIncoming=runtime.RespondToContact(s);
   ai.ApplyScriptDefense(s);ai.UpdateMoveOrder(s,null);ai.Act(s,1/60,null);
   rows.companionWoundedProne=s.stance===2;
   ai.ReleaseCover(s);ai.covers.Query=()=>[];s.coverPickAt=-99;s.suppression=.8;
   rows.companionNoShelter={continues:!runtime.RespondToContact(s),stance:s.stance};
   runtime.MoveActor(s,{x:0,z:-15});
   rows.companionNoShelter.hasRoute=s.p012Guided&&s.goal.z<0;
   runtime.squadRoutes=new Map([[s.id,[{x:0,z:-15}]]]);runtime.BlocksSight=()=>false;
   runtime.RespondToContact(s);runtime.MoveActor(s,{x:0,z:-15});
   ai.Act(s,1/60,null);rows.companionExposedEscape=s.stance===0;
   runtime.BlocksSight=()=>true;runtime.RespondToContact(s);
   rows.companionProtectedEscape=s.stance===1;
   ai.Dispose();
  }
  {
   const {FirstLevelMissionRuntime}=await import('./Script_FirstLevelMissionRuntime.mjs');
   const {WEAPONS}=await import('./Data_Weapons.mjs');
   const {ai,Spawn}=Harness(),s=Spawn('nra',0,0),grenade={alive:true,fuse:2.5,owner:'ija',weapon:WEAPONS.Grenade,position:new T.Vector3(0,0,5)};
   const runtime=Object.assign(Object.create(FirstLevelMissionRuntime.prototype),{ai,time:0,battlefield:ai.ctx.battlefield,BlocksSight:()=>false});
   s.castId='heyoutian';s.tacticalRadiusM=0;s.suppression=.9;
   runtime.Defend(s,s.position);ai.ctx.combat={projectiles:[grenade]};
   for(let i=0;i<120;i++){
    ai.time+=1/60;runtime.time+=1/60;grenade.fuse-=1/60;
    ai.UpdateGrenadeThreats();runtime.RespondToGrenade(s);ai.Act(s,1/60,null);
   }
   rows.grenadeEscape={distance:s.position.distanceTo(grenade.position),dangerRadius:ai.GrenadeDangerRadius(grenade),stance:s.stance,shots:s.fireSequence};
   s.grenadeThreat=grenade;
   const nearby=Candidate('grenade-cover',0,0);
   rows.grenadeCoverRejected=!ai.CoverAllowed(s,nearby);
   grenade.position.copy(s.position);grenade.position.z+=5;runtime.battlefield.Raycast=()=>({t:.5});
   rows.grenadeShieldHolds=!runtime.RespondToGrenade(s)&&!s.missionGrenadeEvade;
   grenade.alive=false;rows.grenadeReleased=!runtime.RespondToGrenade(s)&&!s.missionGrenadeEvade;
   runtime.battlefield.Raycast=()=>null;s.position.set(0,0,0);
   const paired=[-5,5].map(x=>({alive:true,fuse:3.5,owner:'ija',weapon:WEAPONS.Grenade,position:new T.Vector3(x,0,0)}));
   ai.ctx.combat.projectiles=paired;
   for(let i=0;i<190;i++){
    ai.time+=1/60;runtime.time+=1/60;for(const p of paired)p.fuse-=1/60;
    ai.UpdateGrenadeThreats();runtime.RespondToGrenade(s);ai.Act(s,1/60,null);
   }
   rows.pairedGrenadeEscape=paired.map(p=>s.position.distanceTo(p.position)-ai.GrenadeDangerRadius(p));
   s.position.set(0,0,0);s.missionGrenadeReplanAt=0;
   const close={alive:true,fuse:4,owner:'ija',weapon:WEAPONS.Grenade,position:new T.Vector3(0,0,-1)};
   ai.ctx.combat.projectiles=[close];runtime.BlocksSight=(_,to)=>Math.abs(to.x)>.5||to.z>8;
   let minZ=0;
   for(let i=0;i<180;i++){
    ai.time+=1/60;runtime.time+=1/60;close.fuse-=1/60;
    ai.UpdateGrenadeThreats();runtime.RespondToGrenade(s);ai.Act(s,1/60,null);minZ=Math.min(minZ,s.position.z);
   }
   rows.corridorGrenadeEscape={minZ,z:s.position.z,held:s.missionGrenadeEvade,prone:s.stance===2};
   ai.Dispose();
  }
  {
   // The actual rally trench, its Rapier walls and its coarse navigation grid.
   const ai=g.ai,r=g.Debug.FirstLevelMissionRuntime(),s=r.squad.find(a=>a.castId==='heyoutian');
   r.PlaceActor(s,{x:-46.223,z:37.062});s.scriptedNoncombatant=false;
   const from=new T.Vector3(-35,1.5,58),start=s.position.clone();
   const samples=[];
   for(let i=0;i<600;i++){
    ai.time+=1/60;r.time+=1/60;s.suppression=.7;
    if(i%6===0){ai.RememberIncomingFire(s,from);r.RespondToContact(s);ai.ApplyScriptDefense(s);ai.UpdateMoveOrder(s,null);}
    ai.Act(s,1/60,null);
    if(i%60===0)samples.push({p:s.position.toArray(),cover:s.cover?.id,phase:s.coverPhase});
   }
   rows.realTrench={moved:start.distanceTo(s.position),position:s.position.toArray(),cover:s.cover?.id,
    blocked:r.BlocksSight(from,s.position.clone().add(new T.Vector3(0,.5,0))),samples};
   const {WEAPONS}=await import('./Data_Weapons.mjs');
   const blastAt=r.Point({x:-41,z:37}),grenade={position:blastAt,weapon:WEAPONS.Grenade};
   const shielded=ai.GrenadeShielded(s,grenade),health=s.health;
   g.combat.Blast(blastAt,WEAPONS.Grenade.radiusM,WEAPONS.Grenade.damage,'grenade','nra',false,null,'Grenade');
   rows.realBlastShield={shielded,before:health,after:s.health};
   // Reproduce the rolling grenade from the failed normal Support run, on its
   // real curved trench floor. The wounded escort must not reverse across it.
   const replay=[[-9.6588,-79.9927,36.5],[-9.0676,-85.0545,99.9],[-9.4079,-81.6391,11],[-9.2702,-79.5577,95.6]];
   for(const [i,a] of r.squad.entries()){
    r.PlaceActor(a,{x:replay[i][0],z:replay[i][1]});ai.ReleaseCover(a);
    a.health=replay[i][2];a.scriptEssential=false;a.scriptProneUntil=0;a.scriptEscapeStance=null;a.missionGrenadeReplanAt=0;
   }
   const roll={alive:true,fuse:1.9,owner:'ija',weapon:WEAPONS.Grenade,position:r.Point({x:-9.0971,z:-82.4271})};
   g.combat.projectiles.push(roll);let nearest=Infinity;
   for(let i=0;i<114;i++){
    const t=i/113;roll.position.copy(r.Point({x:-9.0971+1.1546*t,z:-82.4271-1.8877*t}));
    ai.time+=1/60;r.time+=1/60;roll.fuse=Math.max(.01,1.9-i/60);
    ai.UpdateGrenadeThreats();for(const a of r.squad)r.RespondToGrenade(a);
    for(const a of r.squad)ai.Act(a,1/60,null);
    nearest=Math.min(nearest,s.position.distanceTo(roll.position));
   }
   roll.alive=false;g.combat.Blast(roll.position,WEAPONS.Grenade.radiusM,WEAPONS.Grenade.damage,'grenade','nra',false,null,'Grenade');
   rows.realCorridorGrenade={nearest,distance:s.position.distanceTo(roll.position),health:s.health,position:s.position.toArray(),
    squad:r.squad.map(a=>({id:a.castId,health:a.health,alive:a.alive}))};
   r.opening.SpawnZhou();
   const gunner=r.opening.zhou,gunnerFrom=r.Point({x:0,z:-155},1.5),gunnerShots=gunner.fireSequence||0;
   for(let i=0;i<240;i++){
    ai.time+=1/60;r.time+=1/60;gunner.suppression=.7;
    ai.RememberIncomingFire(gunner,gunnerFrom);r.opening.UpdateZhou();
    ai.ApplyScriptDefense(gunner);ai.UpdateMoveOrder(gunner,null);ai.Act(gunner,1/60,null);
   }
   rows.gunnerShelter={stance:gunner.stance,held:gunner.scriptShelterUntil>ai.time,
    blocked:r.BlocksSight(gunnerFrom,gunner.position.clone().add(new T.Vector3(0,.5,0))),
    cover:gunner.cover?.id,slack:gunner.scriptCoverSlackM,shots:(gunner.fireSequence||0)-gunnerShots,
    reserved:r.emplacement.guns.get(r.gunId)?.npc===gunner,wounded:r.Has('zhouGunWounded'),essential:!!gunner.scriptEssential};
  }
  return rows;
 });
 await fs.mkdir(path.join(project,'_shots','AiInitiative'),{recursive:true});
 await fs.writeFile(path.join(project,'_shots','AiInitiative','Data_Initiative.json'),JSON.stringify({result,errors},null,2));
 console.log(JSON.stringify(result));
 assert.ok(Object.values(result.guideContact).every(Boolean),'visible close contact yields the guide route to combat, then releases it on the real finite timer');
 assert.ok(result.companionShelter.held&&result.companionShelter.moved>1&&!result.companionShelter.guided,
  'named escort leaves the route and physically reaches cover under distant fire, beyond the old forced-resume timer');
 assert.equal(result.companionShelter.phase,'hide','ongoing incoming fire keeps the escort hidden');
 assert.equal(result.companionShelter.shots,0,'sheltering escort does not expose himself to return fire');
 assert.ok(result.companionShelter.proneAfterDecay,'suppression decay cannot force an immediate rise during the prone commitment');
 assert.ok(result.companionBriefIncoming&&result.companionWoundedProne,
  'a single incoming round triggers cover after suppression decays, and the wounded companion stays prone through normal AI updates');
 assert.ok(result.companionShelter.quietResumes,'quiet releases shelter back to the saved route');
 assert.ok(result.companionReturnFire.peeks&&result.companionReturnFire.shots>0,
  'light pressure permits a real firing stance and return fire between shelter periods');
 assert.ok(result.companionParapetRejected&&result.companionTraverseRejected&&result.companionTrenchAllowed,
  'nearby shelter must remain reachable on the protected trench floor');
 assert.deepEqual(result.companionNoShelter,{continues:true,stance:2,hasRoute:true},
  'without a shelter or route a threatened escort goes prone; the original route remains available');
 assert.ok(result.companionExposedEscape&&result.companionProtectedEscape,
  'cross an exposed opening at full pace and crouch where the terrain blocks the incoming ray');
 assert.ok(result.realTrench.cover&&result.realTrench.moved>1&&result.realTrench.blocked,
  'the actual named companion reaches physical cover in the rally trench and the incoming bullet ray is blocked');
 assert.ok(result.grenadeEscape.distance>=result.grenadeEscape.dangerRadius&&result.grenadeEscape.dangerRadius>7
  &&result.grenadeEscape.stance===0&&result.grenadeEscape.shots===0,
  'a live enemy grenade overrides suppression and the hold order: sprint outside its danger radius before the fuse ends');
 assert.ok(result.pairedGrenadeEscape.every(margin=>margin>=0),
  'escape overlapping blast radii without fleeing toward the second live grenade');
 assert.ok(result.corridorGrenadeEscape.minZ>=0&&result.corridorGrenadeEscape.z>7
  &&result.corridorGrenadeEscape.held&&result.corridorGrenadeEscape.prone,
  'a blocked corridor uses shorter steps away, never crosses the grenade, and holds emergency control at the dead end');
 assert.ok(result.realBlastShield.shielded&&result.realBlastShield.before===result.realBlastShield.after,
  'predicted rally-wall shielding agrees with real grenade damage after destruction resolves');
 assert.ok(result.realCorridorGrenade.health>0&&result.realCorridorGrenade.distance>9
  &&result.realCorridorGrenade.squad.every(a=>a.alive&&a.health>0),
  'the wounded escort survives the recorded rolling grenade on the actual curved Support trench without crossing it');
 assert.ok(result.gunnerShelter.held&&result.gunnerShelter.stance===2&&result.gunnerShelter.blocked
  &&result.gunnerShelter.slack>0&&result.gunnerShelter.shots===0&&result.gunnerShelter.reserved
  &&!result.gunnerShelter.wounded&&!result.gunnerShelter.essential,
  'the independently scripted gunner hides behind physical protection while retaining the real injury and handover gates');
 assert.ok(result.grenadeCoverRejected&&result.grenadeReleased&&result.grenadeShieldHolds,
  'avoid an exposed grenade, retain a solid blast shield and release evasion after it is gone');
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
