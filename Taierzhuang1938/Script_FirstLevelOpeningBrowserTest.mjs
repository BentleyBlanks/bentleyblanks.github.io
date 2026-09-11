// Normal opening input route. Never jumps stages, writes mission facts, player
// coordinates, health, enemy health, ammunition, or invincibility settings.
// Debug.Look is the project's pointer-lock-free mouse delta input adapter.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {OPENING} from "./Data_FirstLevelOpening.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
export async function PlayFirstLevelOpening(page,{out=path.join(here,"_shots/FirstLevelOpening/InputRun"),realtime=false,audioClock=false,from="Train",through="Handover",mount=true,regroup=false}={}){
await fs.mkdir(out,{recursive:true});
const errors=[],trace=[],combatTrace=[],openingShots=new Set();let whisperCaptured=false;
page.on("pageerror",error=>{errors.push(String(error));console.log("PAGEERROR",String(error));});
async function Capture(name){
  if(!realtime)await page.evaluate(()=>window.Tengxian.StepFrames(1,1/60,true));
  await page.screenshot({path:path.join(out,`Scene_${name}.png`)});
  const state=await page.evaluate(()=>({mission:window.Tengxian.Debug.FirstLevelMission(),position:window.Tengxian.player.position.toArray(),health:window.Tengxian.player.health}));
  await fs.writeFile(path.join(out,`Data_${name}.json`),JSON.stringify(state,null,2));
  if(name==="TrainExit"||name==="Failure"){
    const physics=await page.evaluate(()=>{
      const g=window.Tengxian,p=g.player.position,f=g.battlefield,ph=f.physics;
      ph.controller.computeColliderMovement(g.player.body.collider,{x:.05,y:-.005,z:0});
      const hits=[];for(let i=0;i<ph.controller.numComputedCollisions();i++){const hit=ph.controller.computedCollision(i);hits.push({normal:hit.normal1,point:hit.witness1,record:ph.recordByHandle.get(hit.collider.handle),position:hit.collider.translation(),groups:hit.collider.collisionGroups(),handle:hit.collider.handle});}
      return {hits,movement:ph.controller.computedMovement(),stance:g.player.stance,bodyPosition:g.player.body.body.translation(),nearby:f.colliders.filter(b=>b.min[0]<p.x+2&&b.max[0]>p.x-2&&b.min[2]<p.z+2&&b.max[2]>p.z-2).map(b=>({c:b.c,h:b.h,tag:b.tag,handle:b._physicsHandle,actual:ph.world.getCollider(b._physicsHandle)?.translation()})),
        gates:[...f.gates].map(([id,v])=>({id,open:v.open,c:v.collider.c,handle:v.collider._physicsHandle})),
        derail:f.derailMeshes.map(m=>{m.geometry.computeBoundingBox();m.updateMatrixWorld(true);return {min:m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).min,max:m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).max}})};
    });
    await fs.writeFile(path.join(out,`Data_Physics${name}.json`),JSON.stringify(physics,null,2));
  }
}
async function Drive(label,points,{fight=false,until=null,seconds=120}={}){
  await page.evaluate(points=>{window.OpeningInput.points=points;window.OpeningInput.index=0},points);
  let result;
  for(let secondsDone=0;secondsDone<seconds;secondsDone+=realtime?.25:2){
    if(realtime){await page.evaluate(fight=>{window.OpeningInput.fight=fight},fight);await page.waitForTimeout(250);}
    result=await page.evaluate(({fight,until,realtime})=>{
      const g=window.Tengxian,b=window.OpeningInput;
      for(let i=0;!realtime&&i<120&&g.player.alive&&!g.Debug.FirstLevelMissionRuntime().failed;i++){
        b.Step(fight);
        g.StepFrames(1,1/60,false);
        if(until&&[until].flat().every(id=>g.Debug.FirstLevelMissionRuntime().Has(id)))break;
      }
      if(!realtime)g.StepFrames(1,1/60,true);
      const r=g.Debug.FirstLevelMissionRuntime();
      return {t:r.time,stage:r.flow.stage.id,index:b.index,points:b.points.length,position:g.player.position.toArray(),health:g.player.health,alive:g.player.alive&&!r.failed,
        ready:until?[until].flat().every(id=>r.Has(id)):b.index===b.points.length,shots:g.state.playerShots,ammo:g.state.ammo,remaining:r.flow.State().remaining,foe:b.foe,
        damage:window.missionDamage?.slice(-8),
        camera:{position:g.camera.position.toArray(),rotation:g.camera.rotation.toArray()},control:r.controls?.kind,
        audio:{sourceTime:r.voice.current?.sourceTime,phase:r.voice.current?.phase,distance:g.audio.storyVoice?.distance,storyDuck:g.audio.storyDuck?.gain.value,
          cutoff:g.audio.concussionFilter?.frequency.value,breaths:g.audio.RequestedCount('breathHeavy')},
        nearImpact:r.Has('trainNearShellImpact'),firstImpact:r.Has('trainFirstShellImpact'),braces:r.train.entries.map(e=>e.actor.missionTrainLife.brace),
        trainOffset:r.battlefield.trainOffsetM,
        npc:r.squad.map(a=>({id:a.castId,health:a.health,essential:!!a.scriptEssential,p:a.position.toArray(),goal:a.goal.toArray(),
          stance:a.stance,suppression:a.suppression,cover:a.cover?.id,coverPhase:a.coverPhase,
          contact:!!a.missionContactPost,incoming:a.incomingFire,move:a.moveOrder,evade:!!a.missionGrenadeEvade,grenade:a.grenadeThreat?{p:a.grenadeThreat.position.toArray(),fuse:a.grenadeThreat.fuse}:null})),voicePlaying:!!r.voice.current,voiceCue:r.voice.current?.cue?.id,opening:r.opening.State()};
    },{fight,until,realtime});
    trace.push({label,...result});
    combatTrace.push(await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      return {time:r.time,combat:{...g.ai.stats},actors:g.ai.soldiers.filter(a=>a.alive&&(a.side==='nra'||['surface','intrusion','approach'].includes(a.missionEncounter)))
        .map(a=>({id:a.id,missionId:a.missionId,side:a.side,encounter:a.missionEncounter,
          p:a.position.toArray(),state:a.state,health:a.health,stance:a.stance,ready:a.missionTrainReady,
          grenades:a.grenades,tactic:a.missionTactic?{...a.missionTactic}:null,
          unarmed:a.unarmed,noncombatant:!!a.scriptedNoncombatant,contact:!!a.missionContactPost,
          cover:a.cover?.id,target:a.target?.id,targetSide:a.target?.ref?.side,visible:a.targetVisible,
          shots:a.fireSequence,lastFire:a.lastFire,aimError:a.shooting?.errorRad}))};
    }));
    const age=result.t-(result.opening.derailAt??Infinity),rescueAge=result.t-(result.opening.rescueAt??Infinity);
    const shots=[['Meal',result.voiceCue==='TrainMeal'&&result.audio.sourceTime>2],
      ['MealLater',result.voiceCue==='TrainMeal'&&result.audio.sourceTime>13],
      ['PlayerCarRoll',age>.7&&age<1.6],['ImpactBlackout',result.opening.blackout>.99],
      ['BeforeNearImpact',result.firstImpact&&!result.nearImpact],
      ['EyelidPartial',age>3.3&&age<6.6&&result.opening.eyeClosure>.1&&result.opening.eyeClosure<.8],
      ['FallenPlayer',age>3.8&&rescueAge<0],['RescueReach',rescueAge>1&&rescueAge<2.5],
      ['WreckPressure',age>10&&result.opening.escapePressure?.smokeSources===2],
      ['ApronPressure',result.opening.escapePressure?.impacts.length>=4&&result.position[2]>45]];
    for(const [name,ready] of shots)if(ready&&!openingShots.has(name)){openingShots.add(name);await Capture(name);}

    if(!whisperCaptured&&result.voiceCue==="EscapeWhisper"){
      whisperCaptured=true;
      for(let i=0;i<120;i++){
        await page.evaluate(realtime=>{
          const g=window.Tengxian,a=g.Debug.FirstLevelMissionRuntime().companion.Handle("yaowa");
          if(a){
            const aligned=window.OpeningInput.Look(a.position,1.3);
            g.Debug.Key("KeyS",aligned&&a.position.distanceTo(g.player.position)<2.2);
          }
          if(!realtime)g.StepFrames(1,1/60,true);
        },realtime);
        if(realtime)await page.waitForTimeout(17);
      }
      await page.evaluate(()=>window.Tengxian.Debug.Key("KeyS",false));
      await Capture("EscapeWhisperPlaying");
    }
    if(secondsDone%10===0||result.ready||!result.alive)console.log(label,JSON.stringify(result));
    if(result.ready||!result.alive)break;
    if(audioClock&&result.voicePlaying)await page.waitForTimeout(2000);
  }
  await page.evaluate(()=>{window.OpeningInput.points=[];window.OpeningInput.fight=false;const g=window.Tengxian;g.Debug.Key("KeyW",false);g.Debug.Mouse(0,false);g.Debug.Mouse(2,false)});
  await Capture(label);
  assert.ok(result?.alive,`${label}: real combat failed; player health=${result?.health}; fallen squad=${result?.npc.filter(a=>a.health<=0).map(a=>a.id).join(",")||"none"}`);
  assert.ok(result.ready,`${label}: failed to progress: ${JSON.stringify(result)}`);
  return result;
}
try{
  await page.evaluate(async()=>{
    const {BLAST}=await import("./Data_Tuning_Combat.mjs");
    const g=window.Tengxian,Wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),Clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
    if(!window.missionDamage){
      window.missionDamage=[];const takeHit=g.player.TakeHit.bind(g.player);
      g.player.TakeHit=(damage,part,direction,info)=>{
        const before=g.player.health,result=takeHit(damage,part,direction,info);
        window.missionDamage.push({time:g.ai.time,before,after:g.player.health,part,blast:!!info?.blast,
          bullet:!!info?.bullet,position:g.player.position.toArray()});
        if(window.missionDamage.length>120)window.missionDamage.shift();return result;
      };
    }
    window.OpeningInput={points:[],index:0,foe:null,marchEvidence:[],marchStates:{},contactIds:[],
      EvadeGrenade(){
        if(window.MissionInputDriver)return window.MissionInputDriver.EvadeGrenade();
        const p=g.player,threat=g.combat.GrenadeThreats(p.position).find(t=>{
          const from=t.position.clone();from.y+=BLAST.originRiseM;
          const ray=p.position.clone();ray.y+=BLAST.playerHitRiseM;ray.sub(from);
          const d=ray.length(),hit=d>BLAST.wallMarginM?g.battlefield.Raycast(from,ray.normalize(),d,{terrain:true}):null;
          return !hit||hit.t>=d-BLAST.wallMarginM;
        });
        if(!threat){
          if(this.evading){g.Debug.Key("KeyW",false);g.Debug.Key("ShiftLeft",false);this.evading=false;}
          return false;
        }
        const away=Math.atan2(p.position.x-threat.position.x,p.position.z-threat.position.z);
        let heading=null;
        for(const offset of [0,.55,-.55,1.1,-1.1,1.65,-1.65]){
          const angle=away+offset,x=p.position.x+Math.sin(angle)*1.2,z=p.position.z+Math.cos(angle)*1.2;
          const y=g.battlefield.GroundHeight(x,z);
          if(Math.abs(y-p.position.y)<.4&&!g.physics.Overlaps(x,y+.04,z,p.radius,1.78)){heading=angle;break;}
        }
        if(heading==null)return false;
        if(p.stance!=="stand")g.Debug.Key(p.stance==="crouch"?"KeyC":"KeyZ");
        const gap=Wrap(heading+Math.PI-p.yaw-p.aimYaw);
        g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);g.Debug.Look(Clamp(-gap/.0022,-30,30),0);
        g.Debug.Key("KeyW",Math.abs(gap)<.3);g.Debug.Key("ShiftLeft",true);
        this.evading=true;return true;
      },
      Look(point,height=0){
        const p=g.player,e=p.EyePosition,y=height?g.battlefield.GroundHeight(point.x,point.z)+height:e.y;
        const yaw=Math.atan2(p.position.x-point.x,p.position.z-point.z),pitch=Math.atan2(y-e.y,Math.hypot(point.x-e.x,point.z-e.z));
        const dyaw=Wrap(yaw-p.yaw-p.aimYaw),dpitch=pitch-p.pitch-p.aimPitch;
        g.Debug.Look(Clamp(-dyaw/.0022,-24,24),Clamp(-dpitch/.0022,-12,12));
        return Math.abs(dyaw)<(height?.01:.12)&&(!height||Math.abs(dpitch)<.01);
      },
      Target(){
        const eye=g.player.EyePosition;
        const stage=g.Debug.FirstLevelMissionRuntime().flow.stage.id;
        // Keep up with the squad through the communication trench. Only a
        // close blocker interrupts this transit; the authored front defense
        // still requires the full firefight once the player reaches its post.
        const limit=stage==="TrenchEntry"?28:stage==="Support"&&!g.Debug.FirstLevelMissionRuntime().Has("frontReached")?12:85;
        return g.ai.soldiers.filter(a=>a.side==="ija"&&a.alive&&!a.scriptedNoncombatant&&a.position.distanceTo(eye)<limit &&
          (stage!=="TrenchEntry" || a.missionEncounter==="intrusion" || (!a.scriptDefensive && a.position.distanceTo(eye)<20)))
          .sort((a,b)=>a.position.distanceToSquared(eye)-b.position.distanceToSquared(eye)).find(a=>{
            const to=a.position.clone();to.y+=a.stance===2?.45:a.stance===1?1:1.55;
            const direction=to.sub(eye),length=direction.length(),hit=g.battlefield.Raycast(eye,direction.normalize(),length,{terrain:true});
            return !hit||hit.t>=length-.25;
          });
      },
      Step(fight){
        const p=g.player;
        const runtime=g.Debug.FirstLevelMissionRuntime(),march=runtime.squadMarch;
        for(const a of runtime.squad)if(a.missionContactPost&&!this.contactIds.includes(a.id))this.contactIds.push(a.id);
        if(this.checkRally&&runtime.Has('trenchCleared')){
          const leader=runtime.squad[0];
          this.rallyRelease??={time:runtime.time,position:leader.position.toArray(),route:runtime.squadRoutes.get(leader.id).map(p=>({...p}))};
          if(leader.position.z>24)this.rallyReturnMax=Math.max(this.rallyReturnMax||0,leader.position.z-this.rallyRelease.position[2]);
        }
        if(march)for(const actor of march.soldiers){
          const command=actor.squadMarchCommand;
          if(command&&this.marchStates[actor.id]!==command.status){
            this.marchStates[actor.id]=command.status;
            this.marchEvidence.push({id:actor.id,role:command.leader?"leader":"member",status:command.status,
              time:march.march.time,speed:actor.moveSpeed*3.6,position:{x:actor.position.x,z:actor.position.z}});
          }
        }
        while(this.index<this.points.length&&Math.hypot(p.position.x-this.points[this.index].x,p.position.z-this.points[this.index].z)<.85)this.index++;
        // Resolve a real close-combat bind with the shipped shove input, as
        // the main campaign driver does; a rifle trigger cannot break the bind.
        if(g.meleeCombat.Active){
          g.Debug.Key("KeyW",false);g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
          g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);return;
        }
        // The campaign already responds to live HUD grenade warnings after
        // the MG handover; use the same ordinary escape inputs on the approach.
        if(this.EvadeGrenade())return;
        const foe=fight?this.Target():null;this.foe=foe?.missionId||null;
        // Use the ordinary crouch key while clearing the trench. Companions
        // now survive behind cover instead of absorbing the driver's exposure.
        const crouch=(fight||this.cautiousTransit)&&["TrenchEntry","Support"].includes(runtime.flow.stage.id);
        if((p.stance==="crouch")!==crouch)g.Debug.Key("KeyC");
        g.Debug.Mouse(0,false);
        if(foe){
          g.Debug.Key("KeyW",false);g.Debug.Mouse(2,true);
          const aligned=this.Look(foe.position,foe.stance===2?.45:foe.stance===1?1:1.55);
          if(g.state.ammo===0)g.Debug.Key("KeyR");
          else if(aligned)g.Debug.Mouse(0,true);
        }else{
          g.Debug.Mouse(2,false);
          const target=this.points[this.index];
          const aligned=target?this.Look(target):false;
          g.Debug.Key("KeyW",!!target&&aligned);
        }
        if(p.bleeding&&p.health<75)g.Debug.Key("KeyB");
      },
    };
  });
  if(realtime)await page.evaluate(()=>{
    window.OpeningInput.auto=true;
    const Tick=()=>{const b=window.OpeningInput;if(!b.auto)return;b.Step(b.fight);requestAnimationFrame(Tick)};
    requestAnimationFrame(Tick);
  });
  if(["Train","Unloading"].includes(from)){
  await Capture("TrainStart");
  await Drive("Derail",[],{until:"trainDerailed",seconds:55});
  if(through==="Unloading")return;
  await Drive("LuoRescue",[],{until:"luoRescueComplete",seconds:30});
  await Drive("TrainExit",[{x:-69,z:88},{x:-69,z:78},{x:-68,z:70},{x:-66,z:66}],{seconds:80});
  if(through==="Contact"){
    await Drive("TrenchContactApproach",OPENING.approachRoute.slice(0,3),{seconds:80});
    // Observe real NPC combat while the player stays in the protected entrance.
    // Empty route completes each two-second observation without firing a player shot.
    for(let i=0;i<6;i++)await Drive("TrenchContactWatch",[],{seconds:2});
    await Drive("ContactCorner",OPENING.approachRoute.slice(3,4),{seconds:35});
    await page.evaluate(()=>{for(let i=0;i<90;i++){window.OpeningInput.Look({x:-37,z:15},1.1);window.Tengxian.StepFrames(1,1/60,i===89);}});
    await Capture("ReciprocalTrenchFire");
    const rows=combatTrace.flatMap(t=>t.actors.map(a=>({...a,time:t.time})));
    const friendly=rows.filter(a=>a.side==='nra'&&a.targetSide==='ija'&&a.shots>0&&a.time-a.lastFire<2.5);
    const enemy=rows.filter(a=>a.side==='ija'&&a.targetSide==='nra'&&a.shots>0&&a.time-a.lastFire<2.5);
    assert.ok(friendly.length&&enemy.length,'both armies actually fire at each other during the uninterrupted opening');
    const contactIds=await page.evaluate(()=>window.OpeningInput.contactIds);
    // The rally squad waits outside the uncleared traverse; moving enemies may
    // never enter its short contact radius. The deterministic contact/route
    // handoff assertion lives in AiInitiativeBrowserTest, while this normal run
    // still requires real reciprocal fire and armed disembarkation below.
    const parked=rows.filter(a=>a.side==='nra'&&a.ready&&!a.unarmed&&a.missionId!=='TrainWounded');
    // The original wounded man is deliberately unfit for combat, identified from runtime.
    const woundedId=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().trainWounded.id);
    assert.ok(parked.filter(a=>a.id!==woundedId).every(a=>!a.noncombatant),'disembarked armed soldiers are combatants');
    const summary={friendlyShooters:[...new Set(friendly.map(a=>a.id))],enemyShooters:[...new Set(enemy.map(a=>a.id))],
      contacts:contactIds};
    summary.rifleMoves=OPENING.surface.filter(spec=>!spec.hold).map(spec=>{
      const samples=rows.filter(a=>a.missionId===spec.id),start=samples[0]?.p;
      return {id:spec.id,meters:start?Math.max(...samples.map(a=>Math.hypot(a.p[0]-start[0],a.p[2]-start[2]))):0};
    });
    assert.ok(summary.rifleMoves.filter(a=>a.meters>1).length>=3,'surface riflemen relocate during real contact');
    assert.ok(rows.some(a=>a.side==='nra'&&a.health<100)&&rows.some(a=>a.side==='ija'&&a.health<100),
      'reciprocal combat produces real casualties or injuries');
    await fs.writeFile(path.join(out,'Data_ContactSummary.json'),JSON.stringify(summary,null,2));
    assert.deepEqual(errors,[]);console.log('PASS reciprocal opening contact',JSON.stringify(summary));
    return summary;
  }
  if(through==="Handover"){
    await page.evaluate(async realtime=>{
      for(let i=0;i<60;i++){
        window.OpeningInput.Look({x:-76,z:74},2.5);
        if(realtime)await new Promise(resolve=>requestAnimationFrame(resolve));
        else window.Tengxian.StepFrames(1,1/60,i===59);
      }
    },realtime);
    await Capture("CarriageWreck");
  }
  if(through==="Exposure"){
    await Drive("ExposedApron",[{x:-55,z:72}],{seconds:35});
    const before=await page.evaluate(()=>window.Tengxian.player.health);
    const evidence=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      for(let i=0;i<35*60&&g.player.alive;i++){
        window.OpeningInput.Look({x:-35,z:58},1.3);
        g.StepFrames(1,1/60,i%6===0);
      }
      return {health:g.player.health,alive:g.player.alive,invincible:g.player.debug.invincible,grace:g.player.spawnGrace,
        shooters:[...r.enemies.values()].filter(a=>a.missionEncounter==="surface").map(a=>({id:a.missionId,p:a.position.toArray(),alive:a.alive,stance:a.stance,target:a.target?.isPlayer?"player":a.target?.ref?.missionId||a.target?.id,visible:a.targetVisible,los:!r.BlocksSight(r.Point(a.position,1.3),g.player.EyePosition),aim:a.aimTime,fireTimer:a.fireTimer,ammo:a.ammo,lastFire:a.lastFire,hold:a.missionFireHold,rest:a.missionSurfaceRest})),
        probes:[{x:-55,z:72},{x:-54,z:65},{x:-60,z:78},{x:-60,z:70}].map(p=>({p,y:g.battlefield.GroundHeight(p.x,p.z),los:[...r.enemies.values()].filter(a=>a.missionEncounter==="surface"&&!r.BlocksSight(r.Point(a.position,1.3),r.Point(p,1.65))).map(a=>a.missionId)})),
        fire:r.opening.fireEvents.filter(e=>e.player&&e.encounter==="surface"),position:g.player.position.toArray()};
    });
    await Capture("ExposureOutcome");
    await fs.writeFile(path.join(out,"Data_ExposureOutcome.json"),JSON.stringify({before,...evidence},null,2));
    assert.ok(!evidence.invincible&&evidence.grace<=0&&evidence.fire.length>0&&evidence.health<before,"surface fire really harms an exposed player");
    return evidence;
  }
  if(through==="TrenchEntry"){
    await Drive("ExitOrders",[],{until:"unloadOrdersHeard",seconds:40});
    return;
  }
  }
  if(regroup){
    await page.evaluate(()=>{window.OpeningInput.cautiousTransit=true;});
    await Drive("RallyApproach",OPENING.approachRoute.slice(0,3),{seconds:70});
    const started=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().time);
    // Wait for actual passage clearance: a man crossing toward cover at exactly
    // sixteen seconds has not yet settled at his waiting post. Keep the original
    // clearance threshold, a bounded deadline, and the physical walk-through below.
    while(await page.evaluate(({started,x})=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      return g.player.alive&&!r.failed&&r.time<started+45
        &&(r.time<started+16||r.squad.some(a=>Math.abs(a.position.x-x)<=.75));
    },{started,x:OPENING.trenchEntry.x})){
      if(realtime)await page.waitForTimeout(250);
      else await page.evaluate(()=>{for(let i=0;i<120;i++){window.OpeningInput.Step(false);window.Tengxian.StepFrames(1,1/60,false);}});
    }
    await Capture("RallyWaiting");
    const waiting=await page.evaluate(()=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();return {
      alive:g.player.alive&&!r.failed,guide:r.CurrentGuide(),squad:r.squad.map(a=>({id:a.castId,p:a.position.toArray(),route:r.squadRoutes.get(a.id)}))};});
    await fs.writeFile(path.join(out,'Data_RallyWaiting.json'),JSON.stringify(waiting,null,2));
    assert.ok(waiting.alive,'the player and squad survive the real entrance wait');
    assert.ok(waiting.guide?.status&&waiting.guide.label,'waiting at the entrance explains the immediate trench fight');
    assert.ok(waiting.squad.every(a=>Math.abs(a.p[0]-OPENING.trenchEntry.x)>.75),'waiting guards leave the central walking lane clear');
    await page.evaluate(()=>{window.OpeningInput.checkRally=true;});
    // Measure whether the squad leaves a traversable lane. Do not spend this
    // passage window stopping to shoot; the next leg still clears every required enemy.
    await Drive("PassWaitingSquad",[{x:-45,z:27}],{seconds:50});
  }
  let remainingApproach=regroup?OPENING.approachRoute.slice(3):OPENING.approachRoute;
  if(regroup){
    const cleared=await Drive("TrenchClear",remainingApproach,{fight:true,until:"trenchCleared",seconds:150});
    remainingApproach=remainingApproach.slice(cleared.index);
    // The player has cleared this traverse. Let the squad physically catch up
    // before continuing, so the shared safe-running cadence can actually occur.
    // Combat, catch-up and narrow-passage priorities remain untouched.
    const until=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().time+12);
    while(await page.evaluate(until=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();return r.time<until&&g.player.alive&&!r.failed;},until)){
      if(realtime)await page.waitForTimeout(250);
      else await page.evaluate(()=>{for(let i=0;i<120;i++){window.OpeningInput.Step(false);window.Tengxian.StepFrames(1,1/60,false);}});
    }
    await Capture("ClearedTrenchRegroup");
  }
  await Drive("TrenchContact",remainingApproach,{fight:true,until:"shelterReached",seconds:180});
  await Drive("ShelterWhisper",[],{until:"supportOrdersHeard",seconds:100});
  const rifleReady=["frontRifleDefense","rifleWithdrawalResolved","zhouGunWounded"];
  await Drive("FrontRifle",[...OPENING.supportRoute,{x:0,z:-124},{x:0,z:-126.5}],{fight:true,until:rifleReady,seconds:210});
  await Drive("RifleWithdrawal",[],{fight:true,until:rifleReady,seconds:150});
  await Drive("MachineGunApproach",[{x:0,z:-124},{x:0,z:-127.4}],{seconds:40});
  if(mount){
  // A live nearby grenade can legitimately take F priority for a moment.
  // Release and press again after the current interaction resolves.
  for(let attempt=0;attempt<4;attempt++){
    await page.keyboard.down("f");
    if(realtime)await page.waitForTimeout(750);else await page.evaluate(()=>window.Tengxian.StepFrames(45,1/60,true));
    await page.keyboard.up("f");
    if(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().Has("gunOccupied")))break;
    if(realtime)await page.waitForTimeout(300);else await page.evaluate(()=>window.Tengxian.StepFrames(18,1/60,true));
  }
  }
  await Capture("MachineGunHandover");
  const final=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
  if(mount)assert.ok(final.facts.includes("gunOccupied"),"normal F interaction completes the handover");
  assert.ok(final.facts.includes("rifleWithdrawalResolved")&&final.facts.includes("escapeWhisperHeard"));
  if(regroup){
    const release=await page.evaluate(()=>({release:window.OpeningInput.rallyRelease,backtrackM:window.OpeningInput.rallyReturnMax||0}));
    await fs.writeFile(path.join(out,'Data_RallyRelease.json'),JSON.stringify(release,null,2));
    assert.ok(release.release&&release.backtrackM<.6,'after clearing the trench the leader never turns back into his squad');
  }
  if(from==="Train"){
    const mobile=OPENING.surface.filter(s=>s.advance);
    for(const team of new Set(mobile.map(s=>s.team))) {
      const ids=new Set(mobile.filter(s=>s.team===team).map(s=>s.id));
      const movers=new Set(combatTrace.flatMap(row=>row.actors.filter(a=>ids.has(a.missionId)&&a.tactic?.distance>3).map(a=>a.missionId)));
      assert.ok(movers.size>=2,`${team}: multiple attackers physically advance during the normal march`);
    }
    assert.ok(combatTrace.some(row=>row.combat.grenades>0),"enemy grenades are physically thrown during normal opening combat");
    assert.ok(!final.log.some(e=>e.kind==="debugJump"));
    assert.equal(final.opening.playerCar,OPENING.derailCar,"the player carriage is the physical wreck");
    const pressure=final.opening.escapePressure;
    assert.ok(pressure.impacts.length>=4&&pressure.launched.length<=OPENING.escapePressure.shells.length,
      "finite follow-up shells actually hit during the normal escape");
    assert.equal(pressure.smokeSources,0,"the sheltered exchange releases the wreck smoke sources");
    assert.ok(final.opening.rescueAt-final.opening.derailAt<9,'a stopped wreck permits prompt rescue without a long braking wait');
    if(realtime){
      assert.ok(openingShots.has('PlayerCarRoll')&&openingShots.has('ImpactBlackout')&&openingShots.has('RescueReach'),'normal flow records physical roll, blackout and visible rescue');
      const speech=trace.filter(row=>row.voiceCue==='TrainMeal'&&row.audio.phase==='playing'&&row.audio.sourceTime>1);
      assert.ok(speech.length>10&&speech.every(row=>row.audio.distance<6&&row.audio.storyDuck<.4),'the moving meal voice stays nearby and above the ducked environment');
      assert.ok(trace.filter(row=>!row.nearImpact).every(row=>row.braces.every(value=>value===0)),'no passenger anticipates the carriage impact with a protective pose');
      assert.ok(openingShots.has('EyelidPartial')&&trace.some(row=>row.audio.cutoff<900&&row.audio.breaths>0),'partial eyelids, muffled hearing and heavy breaths occur after impact');
      assert.ok(trace.at(-1).audio.cutoff>19000&&final.opening.eyeClosure===0,'hearing and sight recover before combat');
    }
    assert.ok(final.train.entries.filter(e=>e.alive).every(e=>e.exited&&e.arrived),
      "all surviving original passengers leave the wreck and clear their exit lanes");
    if(realtime||audioClock){
      const cheers=await page.evaluate(()=>window.Tengxian.audio.RequestedCount("amb.carriageRearCheer"));
      assert.equal(cheers,2,"both retained rear-group reactions follow the shortened conversation");
    }
  }
  assert.deepEqual(errors,[]);
  console.log("PASS normal opening input, clear trench, private exchange, rifle retreat and machine gun handover");
  return {final,trace};
}catch(error){await Capture("Failure").catch(()=>{});throw error;}
finally{
  await page.evaluate(()=>{if(window.OpeningInput)window.OpeningInput.auto=false;});
  await fs.writeFile(path.join(out,"Data_Trace.json"),JSON.stringify({trace,errors,realtime},null,2));
  await fs.writeFile(path.join(out,"Data_CombatTrace.json"),JSON.stringify(combatTrace,null,2));
}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const realtime=process.argv.includes("--realtime"),server=await ServeRoot(path.resolve(here,".."),0),browser=await LaunchBrowser();
  const exposure=process.argv.includes("--exposure");
  const out=process.argv.find(a=>a.startsWith("--out="))?.slice(6)||path.join(here,"_shots/FirstLevelOpening",exposure?"ExposureRun":realtime?"RealtimeRun":"InputRun");
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&${realtime?"menu=0":"shot=1&manual=1"}&quality=low&scale=small`,{timeout:180000});
    await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
    if(realtime){
      await page.locator("#bootStart").click();
      await page.evaluate(()=>{
        const g=window.Tengxian,stream=g.renderer.domElement.captureStream(30);
        const audioTap=g.audio.ctx.createMediaStreamDestination();
        g.audio.softClip.connect(audioTap);
        for(const track of audioTap.stream.getAudioTracks())stream.addTrack(track);
        window.OpeningVideo={chunks:[],audioTap,recorder:new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9,opus",videoBitsPerSecond:2500000})};
        window.OpeningVideo.recorder.ondataavailable=e=>window.OpeningVideo.chunks.push(e.data);
        window.OpeningVideo.recorder.start(1000);
      });
    }
    await PlayFirstLevelOpening(page,{out,realtime,regroup:process.argv.includes('--regroup'),through:process.argv.includes('--contact')?"Contact":exposure?"Exposure":"Handover"});
  }finally{
    if(realtime){
      const encoded=await page.evaluate(async()=>{
        const v=window.OpeningVideo;if(!v)return null;
        await new Promise(resolve=>{v.recorder.onstop=resolve;v.recorder.stop()});
        window.Tengxian.audio.softClip.disconnect(v.audioTap);
        return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(",")[1]);r.readAsDataURL(new Blob(v.chunks,{type:"video/webm"}))});
      });
      if(encoded){await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,"Video_NormalOpening.webm"),Buffer.from(encoded,"base64"));}
    }
    await browser.close();await new Promise(resolve=>server.close(resolve));
  }
}
