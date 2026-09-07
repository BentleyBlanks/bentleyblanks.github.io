// Isolated visual/input fixtures. Campaign completion is tested separately without teleporting.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,"_shots","MissionPresentation");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on("pageerror",e=>errors.push(String(e)));
try{
 await page.goto(("http://127.0.0.1:"+server.address().port)+"/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=medium&scale=small");
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:90000});
 await page.evaluate(async()=>{
const g=window.Tengxian,T=await import("three"),{MissionPeople}=await import("./Script_FirstLevelMissionPeople.mjs"),{CreateP012StretcherGeometry}=await import("./Script_FirstLevelP012CarryView.mjs");
const root=new T.Group();g.scene.add(root);window.crowdProbe=new MissionPeople({root,actorFactory:g.actorFactory,battlefield:g.battlefield});
window.probeBed=new T.Mesh(CreateP012StretcherGeometry(),new T.MeshStandardMaterial({color:0xa99c7d,side:T.DoubleSide}));root.add(window.probeBed);
window.UpdateCrowdProbe=(time,progress=0,yaw=0)=>{
 const x=42+progress,z=-40,h=g.battlefield.GroundHeight(x,z),c=Math.cos(yaw),s=Math.sin(yaw),people=window.crowdProbe;people.Begin(time);
 for(const end of [-1,1])people.Person("Probe"+end,x-s*end*1.28,z-c*end*1.28,yaw,{role:end===1?"front":"rear",carryTarget:{left:new T.Vector3(x-c*.29-s*end,h+.88,z+s*.29-c*end),right:new T.Vector3(x+c*.29-s*end,h+.88,z-s*.29-c*end)}});
 people.Patient("ProbePatient",x,h+.83,z,yaw,time);people.End();window.probeBed.position.set(x,h+.76,z);window.probeBed.rotation.y=yaw;return people.State();};
g.player.position.set(45,g.battlefield.GroundHeight(45,-35),-35);g.player.yaw=Math.atan2(3,5);g.player.pitch=-.14;g.player.SyncCamera(0);
for(let i=0;i<120;i++)window.UpdateCrowdProbe(i/60);g.StepFrames(1,1/60,true);return window.crowdProbe.State();
});
 const poses=await page.evaluate(()=>{
   const results=[];
   for(let i=120;i<360;i++){
     const time=i/60,move=i<240?(i-120)/60*.8:1.6,yaw=i<240?(i-120)/120*.8:.8;
     const s=window.UpdateCrowdProbe(time,move,yaw);results.push({time,...s});
   }
   const people=window.crowdProbe;
   const feet=[...people.people].flatMap(([id,e])=>["L","R"].map(side=>{
     const p=e.pose.World(e.actor.characterRig.bones["foot"+side]);return {id,side,height:p.y-window.Tengxian.battlefield.GroundHeight(p.x,p.z)};
   }));
   const hands=[...people.people].map(([id,e])=>({id,points:["L","R"].map(s=>e.pose.World(e.actor.characterRig.Grip("weapon"+s)).toArray())}));
   window.Tengxian.StepFrames(1,1/60,true);
   return {results,feet,hands};
 });
 assert.ok(poses.results.every(s=>s.maxGripError<.06),"moving and halted hands stay on actual rails: "+Math.max(...poses.results.map(s=>s.maxGripError)));
 assert.ok(poses.feet.every(f=>f.height>.02&&f.height<.19),"halted feet are planted on terrain: "+JSON.stringify(poses.feet));
 assert.ok(poses.hands.every(h=>Math.hypot(...h.points[0].map((v,i)=>v-h.points[1][i]))>.5),"hands use separate rails");
 await page.screenshot({path:path.join(out,"Scene_Stretcher.png")});
 await fs.writeFile(path.join(out,"Data_Poses.json"),JSON.stringify(poses,null,2));
 const watch=await page.evaluate(async()=>{
   const g=window.Tengxian,{InstallMissionSentry}=await import("./Script_FirstLevelMissionPeople.mjs"),{FirstLevelMissionRuntime}=await import("./Script_FirstLevelMissionRuntime.mjs");
   const actor=g.ai.Spawn("nra",47,-38,{weapon:"HanYang",squadId:"PresentationSentry"});InstallMissionSentry(actor);
   const runtime=Object.create(FirstLevelMissionRuntime.prototype);
   Object.assign(runtime,{squad:[actor],ai:g.ai,battlefield:g.battlefield,column:{litters:[]},player:g.player,time:0});
   const start=actor.position.clone(),head=actor.actor.characterRig.bones.head,first=head.quaternion.clone();let travel=0,scan=0;
   for(let i=0;i<1200;i++){
     runtime.time=i/60;actor.target=null;
     if(!runtime.WaitWatch(actor,"Transfer"))runtime.Defend(actor,actor.position);
     g.StepFrames(1,1/60,false);travel=Math.max(travel,actor.position.distanceTo(start));scan=Math.max(scan,first.angleTo(head.quaternion));
   }
   return {travel,scan,cycles:actor.missionWatch?.cycle};
 });
 assert.ok(watch.travel>.4 && watch.travel<1.5 && watch.scan>.1 && watch.cycles>=2,"waiting sentry shifts position and observes without abandoning the post: "+JSON.stringify(watch));
 const blast=await page.evaluate(async()=>{
   const g=window.Tengxian,T=await import("three"),{CombatSystem}=await import("./Script_Combat.mjs"),{BLAST}=await import("./Data_Tuning_Combat.mjs");
   let sample=null;
   for(const [x,z] of [[-24,-53],[-8,-106],[6,-124],[15,-111]]){
     const target=new T.Vector3(x,g.battlefield.GroundHeight(x,z),z),at=target.clone().add(new T.Vector3(0,BLAST.playerHitRiseM,0));
     for(let a=0;a<24&&!sample;a++){
       const sx=x+Math.cos(a*Math.PI/12)*7,sz=z+Math.sin(a*Math.PI/12)*7,source=new T.Vector3(sx,g.battlefield.GroundHeight(sx,sz),sz),from=source.clone().add(new T.Vector3(0,BLAST.originRiseM,0)),d=at.clone().sub(from),len=d.length();d.normalize();
       const dirt=g.battlefield.Raycast(from,d,len,{terrain:true}),solid=g.battlefield.Raycast(from,d,len);
       if(dirt && dirt.t<len-BLAST.wallMarginM && !solid)sample={source,target};
     }
     if(sample)break;
   }
   if(!sample)return null;
   const Damage=(terrain)=>{
     let damage=0;
     const host={battlefield:{Raycast:(from,dir,len,opts)=>g.battlefield.Raycast(from,dir,len,terrain?opts:null)},ai:{soldiers:[]},
       player:{position:sample.target,Alive:true,Suppress(){},TakeHit(amount){damage+=amount;}}};
     CombatSystem.prototype.Blast.call({host,tmp:new T.Vector3(),tmpB:new T.Vector3()},sample.source,20,85,"shell");
     return damage;
   };
   return {source:sample.source.toArray(),target:sample.target.toArray(),covered:Damage(true),withoutEarth:Damage(false)};
 });
 assert.ok(blast && blast.covered===0 && blast.withoutEarth>1,"real earth banks block blast damage: "+JSON.stringify(blast));
 await fs.writeFile(path.join(out,"Data_WatchAndCover.json"),JSON.stringify({watch,blast},null,2));
 const crowd=await page.evaluate(async()=>{
    const g=window.Tengxian,{FirstLevelMissionColumn}=await import("./Script_FirstLevelMissionColumn.mjs"),
      {FirstLevelMissionView}=await import("./Script_FirstLevelMissionView.mjs");
    window.crowdProbe.root.visible=false;
    const original=g.scene.children.find(c=>c.name==="FirstLevelMissionWhitebox");original.visible=false;
    const column=new FirstLevelMissionColumn();column.Activate();
    for(let i=0;i<3500;i++)column.Update(.2);
    const view=new FirstLevelMissionView({scene:g.scene,battlefield:g.battlefield,column,actorFactory:g.actorFactory,library:g.library,
      physics:{AddSolid(){},MoveSolid(){},RemoveSolid(){}}});
    // Visual fixture only. The continuous campaign does not set player coordinates.
    g.player.position.set(69,7,35);g.player.yaw=Math.atan2(15,10);g.player.pitch=-.40;g.player.SyncCamera(0);
    for(let i=0;i<30;i++)view.Update(700+i/60,{player:g.player});
    const started=performance.now();
    for(let i=0;i<60;i++)view.Update(700.5+i/60,{player:g.player});
    const updateMs=(performance.now()-started)/60;
    for(let i=0;i<12;i++){view.Update(701.5+i/60,{player:g.player});g.StepFrames(1,1/60,true);}
    window.columnProbe={column,view};
    return {litters:column.litters.map(l=>({x:l.x,z:l.z,state:l.state,yaw:l.yaw,area:l.staging?.area})),
      walkers:column.walkers.map(w=>({x:w.x,z:w.z,area:w.staging?.area})),people:view.people.State(),updateMs,aftermath:view.aftermath.triangles};
  });
  assert.ok(crowd.aftermath.distant<crowd.aftermath.detail*.6,"distant bodies preserve silhouettes within a substantially smaller geometry budget");
   assert.equal(crowd.litters.filter(l=>l.area==="courtyard").length,20);
  assert.ok(Math.max(...crowd.litters.map(l=>l.x))-Math.min(...crowd.litters.map(l=>l.x))>25);
  assert.equal(crowd.walkers.filter(w=>w.area==="courtyard").length,58);
  await page.screenshot({path:path.join(out,"Scene_CourtyardGroups.png")});
  await fs.writeFile(path.join(out,"Data_Crowd.json"),JSON.stringify(crowd,null,2));
 await page.goto(("http://127.0.0.1:"+server.address().port)+"/Taierzhuang1938/?phase=1&shot=1&manual=1&quality=low&scale=small");
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:90000});
 const fire=await page.evaluate(()=>{
   const g=window.Tengxian;g.StepFrames(120,1/60,false);
   g.Debug.Mouse(2,true);g.StepFrames(90,1/60,false);
   const before=g.state.playerShots;
   for(let i=0;i<5;i++){g.Debug.Mouse(0,true);g.StepFrames(1,1/60,false);g.Debug.Mouse(0,false);g.StepFrames(120,1/60,false);}
   const aimed=g.state.playerShots-before;
   g.Debug.Mouse(2,false);g.Debug.Key("KeyR");g.StepFrames(300,1/60,false);
   g.Debug.Key("Space",true);g.StepFrames(8,1/60,false);g.Debug.Key("Space",false);
   g.Debug.Mouse(2,true);const jumpBefore=g.state.playerShots;
   g.Debug.Mouse(0,true);g.StepFrames(1,1/60,false);g.Debug.Mouse(0,false);
   const jump={shots:g.state.playerShots-jumpBefore,wantAds:g.player.wantAds,grounded:g.player.grounded,ammo:g.state.ammo};
   g.Debug.Mouse(2,false);g.StepFrames(180,1/60,false);
   return {aimed,jump};
 });
 assert.equal(fire.aimed,5,"holding RMB does not block any of the five rifle shots");
 assert.equal(fire.jump.grounded,false,"test samples a real jump");
 assert.equal(fire.jump.wantAds,false,"airborne pose declines ADS");
 assert.equal(fire.jump.shots,1,"RMB held during unavailable ADS must still permit hip fire");
 const gun=await page.evaluate(()=>{
   const g=window.Tengxian;g.player.Spawn(g.player.position.x+9,g.player.position.z,g.player.yaw);g.StepFrames(30,1/60,false);const p=g.player.position,yaw=g.player.yaw;
   const id=g.Debug.Emplacement.Create({id:"PresentationGun",kindId:"Type92Hmg",position:{x:p.x-Math.sin(yaw)*.85,y:p.y+.7,z:p.z-Math.cos(yaw)*.85},seat:{x:p.x,y:p.y,z:p.z},baseYaw:yaw});
   g.StepFrames(3,1/60,false);const occupied=g.Debug.Emplacement.Occupy(id);
   const start=g.emplacement.stats.shots,restPitch=g.player.pitch;let kick=0,peak=0,smoke=false;
   g.Debug.Mouse(2,true);g.Debug.Mouse(0,true);
   for(let i=0;i<650;i++){g.StepFrames(1,1/60,false);kick=Math.max(kick,Math.abs(g.player.pitch-restPitch));peak=Math.max(peak,g.emplacement.View()?.heat||0);if(i%30===0)smoke ||= g.vfx.smokeSources?.size>0;}
   g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);g.StepFrames(1,1/60,true);
   const panel=document.querySelector(".hudEmplacement");
   return {occupied,shots:g.emplacement.stats.shots-start,kick,peak,smoke,view:g.emplacement.View(),panel:panel?.getBoundingClientRect().toJSON()};
 });
 console.log("GUN_FIXTURE",JSON.stringify({fire,gun}));
 assert.ok(gun.occupied&&gun.shots>=20&&gun.kick>.002,"real mounted shots produce camera recoil");
 assert.ok(gun.peak>.68,"sustained firing reaches the heat warning");
 await page.screenshot({path:path.join(out,"Scene_MachineGun.png")});
 await fs.writeFile(path.join(out,"Data_Fire.json"),JSON.stringify({fire,gun},null,2));
 assert.deepEqual(errors,[]);
 console.log("ok real carry grip, planted feet, full RMB magazine, airborne hip fire and mounted recoil",JSON.stringify({fire,gun}));
}finally{await browser.close();await server.close();}
