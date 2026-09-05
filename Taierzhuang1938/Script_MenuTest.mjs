// 《滕县 一九三八》主菜单冒烟：真浏览器把菜单跑起来，验运镜与选章这两条链路。
//
// 为什么单起一份而不是并进开机冒烟：开机冒烟一律走 ?shot=1（不建菜单），
// 通关冒烟走 ?menu=0（要点 #bootStart）—— 两份都刻意绕开了菜单，
// 于是菜单成了没有任何测试保护的裸奔区。这一份专治它。
//
// 用法：
//   node Taierzhuang1938/Script_MenuTest.mjs            冒烟（约两分钟）
//   node Taierzhuang1938/Script_MenuTest.mjs --shots    再把七章的菜单机位各出一张图
// 退出码即成败。图落在 Taierzhuang1938/_shots/（已 gitignore）。

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const withShots = process.argv.includes("--shots");
const outDir = path.join(projectDir, "_shots");
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 260)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 260)}`);
});

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

// index.html 直接承载启动标题和按钮；一旦被工具误存成 GBK，浏览器会按
// <meta charset="utf-8"> 解码成乱码，残缺的闭合标签还会把后面的主菜单吞进
// 启动层。先在启动浏览器前锁死文件编码，避免只测到脚本数据仍然正确。
let indexText = "";
try {
  indexText = new TextDecoder("utf-8", { fatal: true })
    .decode(fs.readFileSync(path.join(projectDir, "index.html")));
  Check("入口 HTML 是有效 UTF-8", !indexText.includes("\uFFFD"));
} catch (error) {
  Check("入口 HTML 是有效 UTF-8", false, String(error));
}

const Url = (query = "") => `http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small${query}`;

// Explicit lethal-hit fixture, not campaign or balance evidence.
if(process.argv.includes("--p012-retry-only") || process.argv.includes("--p012-voice-only") || process.argv.includes("--p012-enemy-bound-only") || process.argv.includes("--p012-approval-only") || process.argv.includes("--p012-grenade-only") || process.argv.includes("--p012-salvage-only")){
 try{
  await page.goto(Url("&whitebox=p012&shot=1&manual=1"),{timeout:120000});
  await page.waitForFunction(()=>window.Tengxian?.Debug?.P012?.(),null,{timeout:240000});
  if(process.argv.includes("--p012-salvage-only")){
    // Explicit local range initialization on the real P012 outer ground. This
    // proves input/inventory/projectile/drop contracts, NOT sequential B21 play.
    const setup=await page.evaluate(async()=>{
      const g=window.Tengxian,{FirstLevelP012Director,P012_WAVES}=await import("./Script_FirstLevelP012Flow.mjs");
      let flow;FirstLevelP012Director.prototype.Update=function(){flow=this;};g.StepFrames(1);
      // This isolated post-opening fixture needs an already issued, empty
      // rifle; the real level now correctly starts without any weapon.
      flow.host.ReceiveWeapon();
      flow.beat=21;flow.routeIndex=2;
      const index=P012_WAVES.findIndex(w=>w.beat===21);flow.SpawnWave(P012_WAVES[index],index);
      const actors=flow.enemyRoutes.filter(e=>e.encounterBeat===21).map(e=>e.handle);
      actors.forEach((a,i)=>{const x=i?212+i*4:203,z=i?0:-4;
        a.position.set(x,0,z);a.body?.Teleport(x,0,z);a.goal.copy(a.position);a.holdZone={x,z,radius:.3};a.dummy=true;a.target=null;
      });
      actors[0].Kill(null); // Normal Soldier death creates the genuine weapon drop.
      g.player.Spawn(200,0,0);g.player.yaw=-Math.PI/2;g.player.pitch=-.15;
      g.state.ammo=0;g.state.clips=0;g.state.mags.primary.ammo=0;g.state.mags.primary.clips=0;g.state.grenades=2;
      g.StepFrames(90);
      window.p012SalvageFixture={flow,actors,corpse:actors[0]};
      return {scope:"explicit local fixture; no campaign/tactical balance claim",player:g.player.position.toArray(),
        weapon:g.Debug.Slots().weapon,ammo:g.state.ammo,clips:g.state.clips,grenades:g.state.grenades,
        actors:actors.map(a=>({id:a.id,health:a.health,position:a.position.toArray()})),drop:{...actors[0].drop}};
    });
    await page.screenshot({path:path.join(os.tmpdir(),"Scene_P012SalvageBefore.png")});
    const grenade=await page.evaluate(()=>{
      const g=window.Tengxian,f=window.p012SalvageFixture,before=f.actors.map(a=>({id:a.id,health:a.health}));
      g.Debug.Key("KeyG",true);g.StepFrames(36);g.Debug.Key("KeyG",false);
      const projectile=g.combat.projectiles.find(p=>p.owner==="player"&&p.kind==="Grenade"),trajectory=[];
      for(let i=0;i<360;i++){g.StepFrames(1);if(projectile&&i%6===0)trajectory.push({t:i/60,position:projectile.position.toArray(),fuse:projectile.fuse});}
      return {before,after:f.actors.map(a=>({id:a.id,health:a.health})),trajectory,projectile:!!projectile,
        grenades:g.state.grenades,effect:f.flow.State().lastSouthGrenadeEffect,
        detonated:!!projectile&&!g.combat.projectiles.includes(projectile)&&projectile.fuse<=0};
    });
    await page.screenshot({path:path.join(os.tmpdir(),"Scene_P012SalvageGrenade.png")});
    const pickup=await page.evaluate(()=>{
      const g=window.Tengxian,{corpse}=window.p012SalvageFixture,walk=[];
      const before={weapon:g.Debug.Interact().weapon,ammo:g.state.ammo,clips:g.state.clips,pickups:g.interact.pickups,taken:corpse.drop.taken};
      for(let i=0;i<360;i++){
        const delta=corpse.position.clone().sub(g.player.position),distance=Math.hypot(delta.x,delta.z);
        g.player.yaw=Math.atan2(-delta.x,-delta.z);g.player.pitch=-.5;
        if(distance<1.5)break;
        g.Debug.Key("KeyW",true);g.StepFrames(1);walk.push(g.player.position.toArray());
      }
      g.Debug.Key("KeyW",false);g.StepFrames(1);
      const eye=g.player.EyePosition,target=corpse.position.clone();target.y+=.35;
      const delta=target.clone().sub(eye),distance=delta.length(),hit=g.battlefield.Raycast(eye,delta.normalize(),distance);
      const query=g.interact.Query(g.player),clear=!hit||hit.t>=distance-.05;
      if(clear&&query?.kind==="pickup"&&query.soldier===corpse){g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);}
      g.StepFrames(1);
      const after={weapon:g.Debug.Interact().weapon,ammo:g.state.ammo,clips:g.state.clips,pickups:g.interact.pickups,taken:corpse.drop.taken};
      g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);g.StepFrames(1);
      return {before,after,secondPickups:g.interact.pickups,secondAmmo:g.state.ammo,secondClips:g.state.clips,corpse:corpse.position.toArray(),drop:{...corpse.drop},
        player:g.player.position.toArray(),walk,clear,query:query?.kind,label:query?.label};
    });
    await page.screenshot({path:path.join(os.tmpdir(),"Scene_P012SalvagePickedUp.png")});
    const shot=await page.evaluate(()=>{
      const g=window.Tengxian;g.StepFrames(120);g.player.pitch=.65;
      const before={ammo:g.state.ammo,shots:g.state.playerShots};
      g.Debug.Mouse(0,true);g.StepFrames(18);g.Debug.Mouse(0,false);g.StepFrames(1);
      return {before,after:{ammo:g.state.ammo,shots:g.state.playerShots},shot:g.Debug.LastShot()};
    });
    const result={setup,grenade,pickup,shot,problems};
    fs.writeFileSync(path.join(os.tmpdir(),"Data_P012SalvageFixture.json"),JSON.stringify(result,null,2));
    Check("空步枪仍可真实G投雷伤敌",setup.weapon==="HanYang"&&setup.ammo===0&&setup.clips===0&&grenade.grenades===1&&grenade.detonated
      &&grenade.after.some(a=>a.health<grenade.before.find(b=>b.id===a.id).health),JSON.stringify(grenade.effect));
    Check("真实走近可见尸体F缴获同一把枪",pickup.walk.length>0&&pickup.clear&&pickup.after.taken
      &&pickup.after.weapon===pickup.drop.weaponId&&pickup.after.ammo>0&&pickup.after.pickups===pickup.before.pickups+1);
    Check("尸体单次领取，不复刷弹药",pickup.secondPickups===pickup.after.pickups
      &&pickup.secondAmmo===pickup.after.ammo&&pickup.secondClips===pickup.after.clips);
    Check("缴枪后实际左键扣弹射击",shot.after.ammo<shot.before.ammo&&shot.after.shots>shot.before.shots,JSON.stringify(shot));
    Check("无浏览器错误",problems.length===0,problems.join("\n"));
    await browser.close();await server.close();process.exit(failed?1:0);
  }
  if(process.argv.includes("--p012-grenade-only")){
    // Explicit B21 local initialization, not sequential campaign evidence.
    const result=await page.evaluate(async()=>{
      const g=window.Tengxian,{FirstLevelP012Director,P012_WAVES}=await import("./Script_FirstLevelP012Flow.mjs");
      let flow;const update=FirstLevelP012Director.prototype.Update;
      FirstLevelP012Director.prototype.Update=function(){flow=this;};g.StepFrames(1);
      flow.beat=21;flow.routeIndex=2;
      const waveIndex=P012_WAVES.findIndex(w=>w.beat===21);flow.SpawnWave(P012_WAVES[waveIndex],waveIndex);
      const actors=flow.enemyRoutes.filter(e=>e.encounterBeat===21).map(e=>e.handle);
      g.player.Spawn(42,94,0);g.player.yaw=Math.atan2(-7,-10);g.player.pitch=.15;g.state.grenades=2;
      const before=actors.map(a=>({id:a.id,health:a.health,position:a.position.toArray()}));
      g.Debug.Key("KeyG",true);g.StepFrames(36);g.Debug.Key("KeyG",false);
      const projectile=g.combat.projectiles.find(p=>p.owner==="player"&&p.kind==="Grenade");
      const trajectory=[];
      for(let i=0;i<360;i++){g.StepFrames(1);if(projectile&&i%6===0)trajectory.push({time:i/60,position:projectile.position.toArray(),fuse:projectile.fuse,alive:projectile.alive});}
      const effect=flow.State().lastSouthGrenadeEffect;
      const after=actors.map(a=>({id:a.id,health:a.health,alive:a.alive,position:a.position.toArray()}));
      FirstLevelP012Director.prototype.Update=update;
      return {before,after,effect,trajectory,grenades:g.state.grenades,projectile:!!projectile,
        detonated:!!projectile&&projectile.fuse<=0&&!g.combat.projectiles.includes(projectile)};
    });
    fs.writeFileSync(path.join(os.tmpdir(),"Data_P012GrenadeFixture.json"),JSON.stringify(result,null,2));
    Check("真实 G 投掷、飞行、引信与 Blast 产生 B21 有效伤害回执",result.projectile&&result.grenades===1&&!!result.effect&&result.before.length===6&&result.after.some(a=>a.id===result.effect.targetId&&a.health<result.before.find(b=>b.id===a.id).health),JSON.stringify(result));
    Check("引信耗尽且实际生命损失匹配回执",result.detonated&&result.after.some(a=>a.id===result.effect?.targetId&&Math.abs(result.before.find(b=>b.id===a.id).health-a.health-result.effect.damage)<1e-6));
    Check("无浏览器错误",problems.length===0,problems.join("\n"));await browser.close();await server.close();process.exit(failed?1:0);
  }
  if(process.argv.includes("--p012-approval-only")){
    const results=await page.evaluate(async()=>{
      const g=window.Tengxian,{StoryDirector}=await import("./Script_Story.mjs"),{FirstLevelP012Director}=await import("./Script_FirstLevelP012Flow.mjs"),{EscortColumn}=await import("./Script_MissionSetpieces.mjs"),{default:phase}=await import("./Data_FirstLevelP012Whitebox.mjs"),{VOICE_LINES,VOICE_BASE}=await import("./Data_Voice.mjs");
      const audio=new AudioContext();await audio.resume();const entry=VOICE_LINES.find(e=>e.key==="ch1_luo_08"),buffer=await audio.decodeAudioData(await(await fetch(VOICE_BASE+entry.file)).arrayBuffer()),results=[];
      for(const audible of [true,false])for(const rewind of [false,true]){
        let source=null,plays=0,ended=false,time=0,restored=false;const points=new Map();
        const story=new StoryDirector({hud:{Say(){},Title(){}}});
        story.AttachVoice({play:()=>{if(!audible)return 0;plays++;source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);source.onended=()=>{ended=true;};source.start();return buffer.duration;},stop:()=>source?.stop()});
        story.BeginLevel("CH1_NanLu",{beats:phase.whitebox.storyBeats.filter(b=>b.voice==="ch1_luo_08"),actualEventsOnly:true});
        const column=new EscortColumn(g.setpieces.host,{waypoints:[{x:-7,z:-52},{x:0,z:-52}],followRouteBodies:true,members:[{role:"bearer"},{role:"bearer"}],tuning:{columnSpeedMS:1.35}});
        g.setpieces.mem.column=column;g.setpieces.once.delete("p012_columnStart");g.story.pushed.delete("EscortCall");
        const flow=new FirstLevelP012Director({Register:p=>points.set(p.id,p),Carry:()=>g.carry,Signal:name=>{story.Signal(name);g.story.Signal(name);},Signalled:name=>story.Signalled(name)},phase.whitebox);
        flow.beat=12;g.player.Spawn(-7,-52,0);const sample={position:g.player.position,guidePosition:{x:-7,z:-52},guideAlive:true,zone:"Z04",stance:"stand",enemyDeaths:15};flow.Update(.01,sample);
        g.interact.Clear("P012");g.interact.Register({...points.get("p012_volunteer"),tag:"P012"});
        const held=g.interact.Press(g.player);for(let i=0;i<100;i++)g.interact.Update(1/60,g.player);
        let premature=false,approvedAt=null;const start=g.player.position.clone();
        while(time<7&&!story.Signalled("P012EscortApproved")){
          await new Promise(resolve=>setTimeout(resolve,16));time+=.016;story.Update(.016,{});flow.Update(.016,sample);g.setpieces.Update(.016);
          if(!story.Signalled("P012EscortApproved")&&column.started)premature=true;
          if(time<.5)g.player.Update(.016,{forward:1,strafe:0,lookX:0,lookY:0,ads:false},g.state.weapon);
          if(rewind&&!restored&&time>1){const snap=story.P012Snapshot();restored=story.P012Restore(snap);}
        }
        approvedAt=time;flow.Update(.016,sample);g.setpieces.Update(.016);const before=column.Bearers[0]?.handle.position.clone();
        for(let i=0;i<120;i++){g.state.elapsed+=1/60;g.setpieces.Update(1/60);for(const member of column.Alive)g.ai.Act(member.handle,1/60,g.player);g.ai.ctx.physics?.Step(1/60);}
        const moved=before?column.Bearers[0].handle.position.distanceTo(before):0;
        const saved=story.P012Snapshot();story.P012Restore(saved);story.Update(.1,{});
        results.push({audible,rewind,restored,held:held?.point?.id,plays,ended,premature,approved:story.Signalled("P012EscortApproved"),approvedAt,started:column.started,moved,playerMoved:g.player.position.distanceTo(start),duration:buffer.duration});
        for(const member of column.Alive)member.handle.Kill();source?.stop();
      }
      await audio.close();return results;
    });
    Check("真实语音/静音批准及恢复均先批准后开列",results.every(r=>r.held==="p012_volunteer"&&(!r.rewind||r.restored)&&!r.premature&&r.approved&&r.started&&r.moved>.1&&r.approvedAt<8&&r.playerMoved>.1&&r.plays<2),JSON.stringify(results));
    Check("有声非恢复案例自然播完",results.filter(r=>r.audible&&!r.rewind).every(r=>r.ended&&r.approvedAt>=r.duration));
    Check("无浏览器错误",problems.length===0,problems.join("\n"));await browser.close();await server.close();process.exit(failed?1:0);
  }
  if(process.argv.includes("--p012-enemy-bound-only")){
    const rows=await page.evaluate(async()=>{
      const g=window.Tengxian,{default:phase}=await import("./Data_FirstLevelP012Whitebox.mjs"),rows=[];
      const pursuit=phase.whitebox.activities.retreatPursuitRoutes||[];
      const groups=[...phase.whitebox.activities.closeFightGroups,...phase.whitebox.activities.southFightGroups,
        ...pursuit.map(route=>({spawns:[route[0],route[0]],positions:[route.at(-1),route.at(-1)],approaches:[route.slice(1),route.slice(1)],relocations:[route.at(-1),route.at(-1)]}))];
      const {P012_ENEMY_LANES,P012_ANCHORS}=await import("./Data_FirstLevelP012Layout.mjs");
      const spawnPoints=[...Object.values(P012_ENEMY_LANES).map(lane=>lane.spawn),...P012_ANCHORS.blockadePositions,
        ...[...groups,...phase.whitebox.activities.ambushGroups].flatMap(group=>group.spawns||group.positions)];
      const spawns=spawnPoints.map(point=>{const actor=g.ai.Spawn("ija",point.x,point.z,{weapon:"Type38"});
        const eye=actor.position.clone();eye.y+=1.62;const target=eye.clone().set(point.z>110?42:68,1.62,point.z>110?98:24),dir=target.clone().sub(eye),distance=dir.length();
        const row={requested:point,actual:actor.position.toArray(),inMain:g.ai.ctx.nav?.InMain(point.x,point.z),free:g.ai.ctx.physics?.FindFreeSpot(actor.position.x,actor.position.z,.42,1.8),los:!g.ai.ctx.battlefield.Raycast(eye,dir.normalize(),distance),error:Math.hypot(actor.position.x-point.x,actor.position.z-point.z)};actor.Kill();return row;});
      for(const [groupIndex,group] of groups.entries())for(let slot=0;slot<2;slot++){
        const start=group.spawns?.[slot]||group.positions[slot],s=g.ai.Spawn("ija",start.x,start.z,{weapon:"Type38"});
        s.scriptArrivalRadius=.3;s.order="hold";s.state="advance";s.target=null;
        const route=[...(group.approaches?.[slot]||[]),group.positions[slot],group.relocations[slot]];
        for(const [index,point] of route.entries()){
          s.holdZone={x:point.x,z:point.z,radius:.3};s.goal.set(point.x,0,point.z);
          let frames=0;for(;frames<3600&&Math.hypot(s.position.x-point.x,s.position.z-point.z)>.6;frames++){
            g.ai.time+=1/60;g.ai.Act(s,1/60,g.player);g.ai.ctx.physics?.Step(1/60);
          }
          rows.push({groupIndex,slot,index,frames,distance:Math.hypot(s.position.x-point.x,s.position.z-point.z),position:s.position.toArray(),goal:s.goal.toArray(),bounds:g.ai.insideWalls});
        }
        s.Kill();
      }
      const s=g.ai.Spawn("ija",50,70,{weapon:"Type38"});s.order="hold";s.state="advance";s.target=null;s.holdZone={x:50,z:75,radius:.3};s.goal.set(50,0,75);
      for(let i=0;i<600;i++){g.ai.time+=1/60;g.ai.Act(s,1/60,g.player);g.ai.ctx.physics?.Step(1/60);}
      const defaultDistance=Math.hypot(s.position.x-50,s.position.z-75);s.Kill();
      const {EscortColumn,LastLitterArrived,TerminalSlot}=await import("./Script_MissionSetpieces.mjs");
      let airTime=0,airColumn;const airActors=[],airRoster=g.setpieces.mem.column.roster;
      airColumn=new EscortColumn({Time:()=>airTime,PlayerPos:()=>({x:54,z:57}),PositionOf:a=>a.position,Alive:a=>a.alive,
        SpawnActor:({x,z})=>{const a=g.ai.Spawn("nra",x,z,{weapon:"HanYang"});a.unarmed=true;a.scriptedNoncombatant=true;a.order="advance";a.state="advance";airActors.push(a);return a;},SetGoal:(a,x,z)=>a.goal.set(x,0,z)},
        {waypoints:[{x:50,z:47},{x:50,z:68},{x:47,z:80}],followRouteBodies:true,tuning:{columnSpeedMS:1.35},members:airRoster});
      airColumn.Start();g.setpieces.mem.column=airColumn;g.player.Spawn(54,57,0);
      const enteredBefore=g.Debug.P012Scene().airColumnEnteredRoad;
      for(let i=0;i<1800&&!g.Debug.P012Scene().airColumnEnteredRoad;i++){airTime+=1/60;airColumn.Update(1/60);for(const a of airActors)g.ai.Act(a,1/60,g.player);g.ai.ctx.physics?.Step(1/60);}
      const entered=g.Debug.P012Scene().airColumnEnteredRoad;g.story.Signal("P012AirReady");g.setpieces.Update(1/60);
      const airEntry={enteredBefore,entered,active:g.strafe.Active,positions:airActors.map(a=>a.position.toArray()),remainingRoadM:Math.hypot(54-50,57-68)+Math.hypot(50-47,68-74)};
      for(let i=0;i<600&&!g.setpieces.mem.crowdTurnAt;i++){g.state.elapsed+=1/60;g.strafe.Update(1/60);g.setpieces.Update(1/60);}
      airEntry.turnWithoutPlayerGate=!!g.setpieces.mem.crowdTurnAt&&!g.story.Signalled("P012CrowdReady");
      airEntry.turnGap=g.setpieces.mem.crowdTurnAt-g.setpieces.mem.railPassDone;
      g.player.Spawn(45.356,66.265,Math.PI);g.story.Signal("P012SeekAirCover");
      for(let i=0;i<285;i++){airTime+=1/60;g.state.elapsed+=1/60;g.strafe.Update(1/60);g.setpieces.Update(1/60);for(const actor of airActors)g.ai.Act(actor,1/60,g.player);g.ai.ctx.physics?.Step(1/60);}
      airEntry.formation=airColumn.members.map(member=>({role:member.role,slot:member.slot,position:member.handle.position.toArray()}));
      const closeMembers=airColumn.members.filter(member=>member.role==="bearer"||member.role==="civilian");
      airEntry.minimumBodyGap=Math.min(...closeMembers.flatMap((member,i)=>closeMembers.slice(i+1).map(other=>member.handle.position.distanceTo(other.handle.position))));
      airEntry.civiliansAhead=airColumn.members.filter(member=>member.role==="civilian").every(member=>member.handle.position.z>g.player.position.z);
      g.strafe.Abort("fixtureEnd");for(const actor of airActors)actor.Kill();
      let now=0,column;const bodies=[];
      column=new EscortColumn({Time:()=>now,PlayerPos:()=>column.HeadPosition(),PositionOf:a=>a.position,Alive:a=>a.alive,
        SpawnActor:({x,z})=>{const a=g.ai.Spawn("nra",x,z,{weapon:"HanYang"});a.unarmed=true;a.scriptedNoncombatant=true;a.scriptArrivalRadius=.3;a.order="advance";a.state="advance";bodies.push(a);return a;},
        SetGoal:(a,x,z)=>a.goal.set(x,0,z)},
        {waypoints:[{x:5,z:-46},{x:-7,z:-37}],followRouteBodies:true,tuning:{columnSpeedMS:2.05},members:[...Array.from({length:4},()=>({role:"bearer"})),{role:"guard"}]});
      column.Start();
      const fallen=column.litters[0].rear,replacement=column.members[4];fallen.handle.Kill();
      replacement.role="bearer";replacement.slot={...fallen.slot};column.litters[0].rear=replacement;
      g.setpieces.mem.column=column;
      const savedPhase=g.setpieces.phase;
      g.setpieces.phase={...savedPhase,whitebox:{...savedPhase.whitebox,returnWaypoints:[{x:5,z:-46},{x:-7,z:-37}]}};
      g.story.Signal("SouthCut");g.setpieces.Update(1/60);g.setpieces.phase=savedPhase;
      const before=LastLitterArrived(column);
      for(let i=0;i<1800&&!LastLitterArrived(column);i++){now+=1/60;column.Update(1/60);for(const a of bodies.filter(a=>a.alive)){g.ai.Act(a,1/60,g.player);}g.ai.ctx.physics?.Step(1/60);}
      const parked={before,arrived:LastLitterArrived(column),positions:column.litters.flatMap(l=>[l.front,l.rear]).map(m=>m.handle.position.toArray()),targets:column.litters.flatMap(l=>[l.front,l.rear]).map(m=>TerminalSlot(column.waypoints,m.slot.back)),spans:column.litters.map(l=>l.front.handle.position.distanceTo(l.rear.handle.position))};
      const centers=column.litters.map(l=>l.front.handle.position.clone().add(l.rear.handle.position).multiplyScalar(.5));parked.centerGap=centers[0].distanceTo(centers[1]);
      g.setpieces.mem.column=column;g.setpieces.mem.p012CarriedLitter=column.litters[0];
      const original=column.litters[0],second=column.litters[1],secondBefore=second.front.handle.position.clone();
      g.setpieces.spoken.add("ch1_shangbing_04");g.story.Signal("P012RegripReady");g.setpieces.Update(1/60);
      const rear=original.rear.handle.position;g.player.Spawn(rear.x,rear.z,0);
      const candidate=g.interact.Query(g.player),picked=candidate?.point?.id==="ch1_regrip"&&!!g.interact.Press(g.player);
      let travel=0;const startCarry=g.player.position.clone();
      for(let i=0;i<1800&&Math.hypot(g.player.position.x+7,g.player.position.z+52)>.7;i++){
        const dx=-7-g.player.position.x,dz=-52-g.player.position.z;g.player.yaw=Math.atan2(-dx,-dz);
        g.player.Update(1/60,{forward:1,strafe:0,lookX:0,lookY:0,sprint:false,ads:false},g.state.weapon);
        g.carry.Update(1/60);g.setpieces.Update(1/60);g.ai.ctx.physics?.Step(1/60);
      }
      travel=g.player.position.distanceTo(startCarry);
      parked.regrip={picked,same:original===g.setpieces.mem.p012CarriedLitter,travel,remaining:Math.hypot(g.player.position.x+7,g.player.position.z+52),secondMoved:second.front.handle.position.distanceTo(secondBefore)};
      g.carry.ForceRelease("fixtureEnd");g.player.Spawn(44,62,Math.PI);g.player.spawnGrace=0;
      const attackers=phase.whitebox.activities.closeFightGroups.flatMap(group=>group.positions.map((end,i)=>{
        const start=group.spawns[i],actor=g.ai.Spawn("ija",start.x,start.z,{weapon:"Type38"});
        actor.scriptedNoncombatant=true;actor.state="advance";actor.order="hold";actor.scriptArrivalRadius=.3;
        return {actor,points:[...group.approaches[i],end],index:0,stop:group.stagingStopIndices[i]};
      }));
      function EnemyStep(staged){for(const entry of attackers){const a=entry.actor;if(!a.alive)continue;
        const target=staged&&entry.index>entry.stop?(entry.stop<0?a.position:entry.points[entry.stop]):entry.points[entry.index];
        a.holdZone={x:target.x,z:target.z,radius:.3};a.goal.set(target.x,0,target.z);
        if(a.position.distanceTo(a.goal)<.6&&entry.index<entry.points.length-1&&(!staged||entry.index<=entry.stop))entry.index++;
        g.ai.Think(a,.1,g.player);g.ai.Act(a,1/60,g.player);
      }g.ai.ctx.physics?.Step(1/60);}
      for(let i=0;i<1800;i++){g.ai.time+=1/60;EnemyStep(true);}
      const stageShots=attackers.filter(entry=>Number.isFinite(entry.actor.lastFire)&&entry.actor.lastFire>0).length;
      for(const entry of attackers)entry.actor.scriptedNoncombatant=false;
      // Observational firing fixture: no world advance or guaranteed player-hit replay.
      g.strafe.StrafeRun({preset:"divePress",...phase.whitebox.aircraftRoutes.divePress,TrackTo:()=>g.player.position,player:{enabled:false}});
      const fireSequence=[],impactTimes=[];let aircraftFiringFrames=0;const impactsBefore=g.strafe.stats.impacts;
      for(let i=0;i<600;i++){g.ai.time+=1/60;g.state.elapsed+=1/60;const previousImpacts=g.strafe.stats.impacts;g.strafe.Update(1/60);
        if(g.strafe.stats.impacts>previousImpacts)impactTimes.push(i/60);
        if(g.strafe.View()?.firing)aircraftFiringFrames++;
        const before=attackers.map(e=>e.actor.lastFire);EnemyStep(false);
        attackers.forEach((entry,index)=>{if(entry.actor.lastFire!==before[index])fireSequence.push({index,time:i/60,air:g.strafe.View()?.phase,airFiring:g.strafe.View()?.firing});});
      }
      for(const shot of fireSequence)shot.nearestImpactS=Math.min(...impactTimes.map(time=>Math.abs(time-shot.time)));
      return {rows,spawns,parked,airEntry,overlap:{stageShots,fireSequence,count:attackers.length,aircraftFiringFrames,aircraftImpacts:g.strafe.stats.impacts-impactsBefore},scoutRange:Math.hypot(P012_ENEMY_LANES.center.reveal.x-P012_ANCHORS.gunports[1].x,P012_ENEMY_LANES.center.reveal.z-P012_ANCHORS.gunports[1].z),defaultDistance};
    });
    Check("真实 AI / 碰撞逐段到达十二名战术演员及两条有限追击路线",rows.rows.every(row=>row.distance<=.6),JSON.stringify(rows));
    Check("未指定字段保留1.2米停止距离",rows.defaultDistance>.9&&rows.defaultDistance<=1.3,String(rows.defaultDistance));
    Check("指定出生仅允许安全导航半格吸附且偏移点射界成立",rows.spawns.every(row=>row.error<.01||(row.error<=1&&!row.inMain&&row.free.moved===0&&row.los)),JSON.stringify(rows.spawns));
    Check("侦察露出点距离主枪眼45至60米",rows.scoutRange>=45&&rows.scoutRange<=60,String(rows.scoutRange));
    Check("四抬手实际入路即起飞且玩家仍有过路距离",!rows.airEntry.enteredBefore&&rows.airEntry.entered&&rows.airEntry.active&&rows.airEntry.remainingRoadM>15,JSON.stringify(rows.airEntry));
    Check("铁路离场立即转弯，不等待玩家冲刺门",rows.airEntry.turnWithoutPlayerGate&&rows.airEntry.turnGap<=1/60,JSON.stringify(rows.airEntry));
    Check("实际十人队列转弯末端百姓仍在观察者前方且不重叠",rows.airEntry.civiliansAhead&&rows.airEntry.minimumBodyGap>.84,JSON.stringify({formation:rows.airEntry.formation,minimumBodyGap:rows.airEntry.minimumBodyGap}));
    Check("替补护卫后四名真实抬手按担架归属停车",!rows.parked.before&&rows.parked.arrived&&rows.parked.centerGap>=3&&rows.parked.spans.every(span=>span>=1.2&&span<=2.8),JSON.stringify(rows.parked));
    Check("同副真实重新握持并搬入掩蔽点，另一副仍停车",rows.parked.regrip.picked&&rows.parked.regrip.same&&rows.parked.regrip.travel>=10&&rows.parked.regrip.remaining<.7&&rows.parked.regrip.secondMoved<.01,JSON.stringify(rows.parked.regrip));
    Check("同六人待机不射击，攻击段地面枪响距真实航空弹着不超过0.25秒",rows.overlap.count===6&&rows.overlap.stageShots===0&&rows.overlap.aircraftFiringFrames>0&&rows.overlap.aircraftImpacts>0&&rows.overlap.fireSequence.some(row=>row.air==="strafe"&&row.nearestImpactS<=.25),JSON.stringify(rows.overlap));
    Check("无浏览器错误",problems.length===0,problems.join("\n"));
    await browser.close();await server.close();process.exit(failed?1:0);
  }
  if(process.argv.includes("--p012-voice-only")){
    const voices=await page.evaluate(async()=>{
      const {VOICE_LINES,VOICE_BASE}=await import("./Data_Voice.mjs");
      const {default:phase}=await import("./Data_FirstLevelP012Whitebox.mjs");
      const keys=[...new Set(phase.whitebox.storyBeats.map(b=>b.voice).filter(Boolean))],audio=new AudioContext();
      const rows=await Promise.all(keys.map(async key=>{const entry=VOICE_LINES.find(v=>v.key===key);try{
        if(!entry?.file)throw new Error("missing voice entry");const response=await fetch(VOICE_BASE+entry.file);if(!response.ok)throw new Error(String(response.status));
        const buffer=await audio.decodeAudioData(await response.arrayBuffer());return {key,duration:buffer.duration};
      }catch(error){return {key,error:String(error)};}}));await audio.close();
      const {StoryDirector}=await import("./Script_Story.mjs"),longest=rows.filter(row=>!row.error).sort((a,b)=>b.duration-a.duration)[0],played=[];
      const director=new StoryDirector({hud:{Say(){},Title(){}}});
      director.AttachVoice(({key})=>{played.push({key,at:director.levelTime});return key===longest.key?longest.duration:1;});
      director.BeginLevel(phase.contentId,{beats:[{type:"line",at:"delay:0",voice:"nextFixture",text:"fixture"}],actualEventsOnly:true});
      director._Speech("fixture",{voice:longest.key,text:"fixture"},4.2);
      for(let i=0;i<Math.ceil((longest.duration+.4)*60);i++)director.Update(1/60,{});
      return {rows,played,longest};
    });
    console.log("P012 decoded audio durations",JSON.stringify(voices.rows));
    Check("P012引用语音全部可实际解码",voices.rows.every(v=>!v.error));
    Check("当前P012实际录音不触及八秒占用上限",voices.rows.every(v=>v.duration+.35<=8),JSON.stringify(voices.longest));
    Check("生产Story队列等待最长实际录音及尾留白",voices.played.length===2&&voices.played[1].at>=voices.longest.duration+.35,JSON.stringify(voices.played));
    await browser.close();await new Promise(resolve=>server.close(resolve));process.exit(failed?1:0);
  }
  const environment=await page.evaluate(()=>window.Tengxian.Debug.P012Environment());
  Check("P012不生成外部环境布景/PCG/饰件",environment.externalCount===0&&environment.pcgCount===0&&environment.trimCount===0&&environment.roots.length===0,JSON.stringify(environment));
  const downloads=await page.evaluate(()=>performance.getEntriesByType("resource").map(r=>r.name).filter(name=>/Model_(BattlefieldPack|BarbedWireSet|MarketStorageSet|CityWallBreachPack|CityWallDetailPack|LeaflessTreeSet)\.glb/.test(name)));
  Check("P012不下载正式环境模型包",downloads.length===0,JSON.stringify(downloads));
  const result=await page.evaluate(()=>{
   const g=window.Tengxian;g.StepFrames(2);
   const before={flow:JSON.stringify(g.Debug.P012()),ammo:g.state.ammo,clips:g.state.clips,pool:g.state.nraPool,actors:g.ai.soldiers.map(a=>a.id)};
   g.player.spawnGrace=0;g.player.TakeHit(10000,"torso");g.StepFrames(1);
   const menu=g.Debug.Menu(),failed=!g.player.Alive&&!g.state.running;
   const frozenBefore=JSON.stringify({elapsed:g.state.elapsed,hp:g.player.health,aiTime:g.ai.time,positions:g.ai.soldiers.map(a=>a.position.toArray()),flow:g.Debug.P012()});
   g.StepFrames(600,1/60,false);
   const frozen=frozenBefore===JSON.stringify({elapsed:g.state.elapsed,hp:g.player.health,aiTime:g.ai.time,positions:g.ai.soldiers.map(a=>a.position.toArray()),flow:g.Debug.P012()});
   g.Debug.MenuAct("retrySandbox");
   return {before,menu,failed,frozen,alive:g.player.Alive,hp:g.player.health,ammo:g.state.ammo,clips:g.state.clips,pool:g.state.nraPool,actors:g.ai.soldiers.map(a=>a.id),flow:JSON.stringify(g.Debug.P012()),identity:g.state.identity,running:g.state.running};
  });
  Check("真实致死进入专属失败菜单",result.failed&&result.menu.items.includes("retrySandbox"));
  Check("失败菜单600帧不推进时间/伤害/NPC/任务",result.frozen);
  Check("恢复同一顺子而非随机新兵",result.identity.name==="顺子"&&!("origin" in result.identity)&&result.alive&&result.running&&result.hp===100);
  Check("任务资源与NPC世界保留",["flow","ammo","clips","pool"].every(k=>result[k]===result.before[k])&&JSON.stringify(result.actors)===JSON.stringify(result.before.actors));
  const loaded=await page.evaluate(()=>{
   const g=window.Tengxian,payload={fixture:"existingLoad"};g.carry.Begin("stretcher",{payload});
   const serial=g.carry.serial,position=g.player.position.clone(),update=g.combat.Update;
   g.combat.Update=function(...args){update.apply(this,args);this.Update=update;g.player.spawnGrace=0;g.player.TakeHit(10000,"torso");};
   g.StepFrames(1);const label=g.menu.items.find(i=>i.id==="retrySandbox")?.label;
   g.Debug.MenuAct("retrySandbox");
   return {label,sameSerial:g.carry.serial===serial,samePayload:g.carry.load?.payload===payload,active:g.carry.Active,moved:g.player.position.distanceTo(position)};
  });
  Check("负重死亡在同一载物处恢复，不搬运/复制",loaded.label==="在载物处继续"&&loaded.sameSerial&&loaded.samePayload&&loaded.active&&loaded.moved<.1,JSON.stringify(loaded));
  const completed=await page.evaluate(()=>{
   const g=window.Tengxian;g.story.Signal("P012Complete");g.StepFrames(1);
   const Snapshot=()=>JSON.stringify({elapsed:g.state.elapsed,hp:g.player.health,aiTime:g.ai.time,positions:g.ai.soldiers.map(a=>a.position.toArray()),flow:g.Debug.P012(),carrySerial:g.carry.serial});
   const before=Snapshot();g.StepFrames(600,1/60,false);
   return {frozen:before===Snapshot(),items:g.Debug.Menu().items,running:g.state.running};
  });
  Check("完成菜单600帧冻结全部世界，不进入CH2",completed.frozen&&!completed.running&&completed.items.join(",")==="restartSandbox,exitSandbox");
  Check("无浏览器异常",problems.length===0,problems.join(";"));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 process.exit(failed?1:0);
}

async function Boot(query = "") {
  await page.goto(Url(query), { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.waitForFunction(() => window.Taierzhuang.Debug.Menu !== undefined, null, { timeout: 60000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
}

// ===========================================================================
// 1) 开机就落在菜单上，玩法没有在背后跑
// ===========================================================================
// Isolated browser DOM executes the production completion method and CSS;
// --completion-only avoids loading the full battlefield for this visual gate.
{
  const source=fs.readFileSync(path.join(projectDir,"Script_Menu.mjs"),"utf8").replace(/\r/g,"");
  const methods=["OpenSandboxComplete","ClearSandboxComplete"].map(name=>source.match(new RegExp(`  ${name}\\([^\\n]*[\\s\\S]*?\\n  }\\n`))[0]).join(",");
  await page.setContent(`<style>${fs.readFileSync(path.join(projectDir,"Style_Menu.css"),"utf8")}</style><body style="background:#829aaa"><div id="menu"><div class="mnTitle"><div class="mnTitleSub"></div></div><nav class="mnList">重新测试 / 返回主菜单</nav></div></body>`);
  await page.evaluate(methods=>{
    const menu={...new Function(`return ({${methods}})`)(),root:document.querySelector("#menu"),el:{titleSub:document.querySelector(".mnTitleSub")},OpenPause(){this.ClearSandboxComplete();this.root.classList.add("pause");},SetItems(items){this.items=items;}};
    window.completionTest=menu;menu.OpenSandboxComplete();
  },methods);
  Check("白盒完成淡黑期间不显示操作",await page.locator(".mnList").evaluate(el=>getComputedStyle(el).visibility==="hidden"));
  await page.waitForTimeout(2350);
  const completed=await page.evaluate(()=>({background:getComputedStyle(completionTest.root).backgroundColor,visible:getComputedStyle(document.querySelector(".mnList")).visibility,items:completionTest.items.map(item=>item.id)}));
  Check("白盒约两秒后纯黑完成界面",completed.background==="rgb(0, 0, 0)"&&completed.visible==="visible",JSON.stringify(completed));
  Check("白盒完成没有第二章入口",completed.items.join(",")==="restartSandbox,exitSandbox");
  await page.screenshot({path:path.join(outDir,"Scene_P012CompleteDom.png")});
  await page.evaluate(()=>completionTest.ClearSandboxComplete());
  Check("退出白盒完成恢复原菜单样式",await page.locator("#menu").evaluate(el=>getComputedStyle(el).backgroundColor==="rgba(0, 0, 0, 0)"&&!el.classList.contains("p012Complete")));
}
if(process.argv.includes("--completion-only")){await browser.close();server.close();process.exit(failed?1:0);}
if (process.argv.includes("--levels-only")) {
  try {
    await Boot();
    await CheckMissionList();
    Check("选章无浏览器错误",problems.length===0,problems.join(";"));
  } finally { await browser.close(); server.close(); }
  process.exit(failed?1:0);
}
await Boot();
{
  const m = await page.evaluate(() => {
    const T = window.Taierzhuang;
    return {
      menu: T.Debug.Menu(),
      running: T.state.running,
      inMenu: T.state.menu,
      hudHidden: document.getElementById("hud").style.display === "none",
      viewmodel: T.viewmodel.root.visible,
      nra: T.ai.soldiers.filter((s) => s.side === "nra").length,
      ija: T.ai.soldiers.filter((s) => s.side === "ija").length,
      rootOff: document.getElementById("menu").classList.contains("off"),
      items: [...document.querySelectorAll("#menu .mnItem")].map((e) => e.textContent.trim()),
      documentTitle: document.title,
      bootTitle: document.getElementById("bootTitle")?.textContent.trim(),
      bootSubtitle: document.getElementById("bootSub")?.textContent.trim(),
      bootStart: document.getElementById("bootStart")?.textContent.trim(),
      bootHierarchy: document.getElementById("bootTitle")?.parentElement?.id,
      menuTitle: document.querySelector("#menu .mnTitleMain")?.textContent.trim(),
      menuSubtitle: document.querySelector("#menu .mnTitleSub")?.textContent.trim(),
      menuLines: [...document.querySelectorAll("#menu .mnTitleLine")].map((e) => e.textContent.trim()),
    };
  });
  Check("启动界面标题、日期与按钮文字正确",
    m.documentTitle === "滕县 一九三八"
      && m.bootTitle === "滕县 一九三八"
      && m.bootSubtitle === "一九三八年三月十四日 — 十八日 · 山东滕县"
      && m.bootStart === "进 城"
      && m.bootHierarchy === "bootHead",
    `${m.documentTitle} / ${m.bootTitle} / ${m.bootSubtitle} / ${m.bootStart}`);
  Check("主菜单标题与战役说明文字正确",
    m.menuTitle === "滕县 一九三八"
      && m.menuSubtitle === "一九三八年三月十四日 — 十八日 · 山东滕县"
      && m.menuLines.length === 3
      && m.menuLines.every((line) => line.length > 0 && !line.includes("\uFFFD")),
    `${m.menuTitle} / ${m.menuSubtitle} / ${m.menuLines.join(" | ")}`);
  Check("开机落在主菜单上", m.menu.open && m.inMenu && !m.running && !m.rootOff,
    `open=${m.menu.open} menu=${m.inMenu} running=${m.running}`);
  Check("菜单六项都在（含设置与调试选项）",
    m.items.length === 6 && m.items.includes("调试选项") && m.items.includes("设置"),
    m.items.join(" / "));
  Check("菜单里 HUD 与手里的枪都藏起来了", m.hudHidden && !m.viewmodel,
    `hud=${m.hudHidden} viewmodel=${m.viewmodel}`);
  // 菜单里摆的是几个守军，**一个日军都不许有** ——
  // 有敌人就会开打，开打就死人，而兵员池是关卡状态（玩家还没按开始）
  Check("菜单场景里只有守军、没有日军", m.nra === 5 && m.ija === 0, `nra=${m.nra} ija=${m.ija}`);
  Check("菜单背后建的是东关那一章（Data_Menu.MENU_SCENE.slice）", m.menu.slice === 2,
    `slice=${m.menu.slice}`);
}

// ===========================================================================
// 1a) 主菜单真实点击「设置」：不能只验内部回调，面板必须真的在屏幕上
// ===========================================================================
await page.click('.mnItem[data-act="settings"]');
{
  const opened = await page.evaluate(() => {
    const panel = document.querySelector(".edPanel.launcher");
    const rect = panel?.getBoundingClientRect();
    return {
      menu: window.Taierzhuang.Debug.Menu(),
      editor: window.Taierzhuang.Debug.Editor(),
      display: panel ? getComputedStyle(panel).display : "missing",
      width: rect?.width || 0,
      height: rect?.height || 0,
    };
  });
  Check("主菜单点击设置会显示设置与工具面板",
    opened.menu.open && opened.menu.mode === "title"
      && opened.editor.panelOpen && !opened.editor.hidden
      && opened.display === "flex" && opened.width > 0 && opened.height > 0,
    JSON.stringify(opened));
}
await page.click(".edPanel.launcher .edX");
{
  const closed = await page.evaluate(() => ({
    menu: window.Taierzhuang.Debug.Menu(),
    editor: window.Taierzhuang.Debug.Editor(),
    inMenu: window.Taierzhuang.state.menu,
  }));
  Check("关闭设置后回到主菜单并重新隐藏开发工具层",
    closed.menu.open && closed.menu.mode === "title" && closed.inMenu
      && !closed.editor.panelOpen && closed.editor.hidden,
    JSON.stringify(closed));
}

// ===========================================================================
// 1b) 调试选项：开关在主菜单上可见、实际写入运行时，再返回主菜单
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("debug"));
  const debugPanel = await page.evaluate(() => ({
    mode: window.Taierzhuang.Debug.Menu().mode,
    options: [...document.querySelectorAll("#menu .mnDebugRow")].map((e) => e.dataset.option),
  }));
  Check("主菜单能打开五项调试选项", debugPanel.mode === "debug" && debugPanel.options.length === 5,
    JSON.stringify(debugPanel));
  await page.screenshot({ path: path.join(outDir, "Menu_Debug.png") });
  await page.click('#menu .mnDebugRow[data-option="noCollision"] input');
  const noCollision = await page.evaluate(() => window.Taierzhuang.Debug.DebugOptions());
  Check("无碰撞开关写入玩法配置", noCollision.noCollision === true, JSON.stringify(noCollision));
  await page.evaluate(() => window.Taierzhuang.Debug.SetDebugOption("noCollision", false));
  await page.keyboard.press("Escape");
  Check("调试面板 Esc 返回主菜单", await page.evaluate(() => window.Taierzhuang.Debug.Menu().mode === "title"));
}

// ===========================================================================
// 2) 运镜：相机真的在动，而且是按机位表在动
// ===========================================================================
{
  const before = await page.evaluate(() => window.Taierzhuang.Debug.Menu().camera);
  await page.evaluate(() => window.Taierzhuang.StepFrames(180));   // 3 秒
  const after = await page.evaluate(() => window.Taierzhuang.Debug.Menu().camera);
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  Check("推轨在动（三秒内相机位移 > 0.3 m）", moved > 0.3, `moved=${moved.toFixed(2)} m`);
  // 焦距语汇沿用分镜表：35 mm ≈ 37.8°，不该是玩法用的 55°
  Check("机位吃的是机位表的焦距，不是玩法 FOV", Math.abs(after.fov - 55) > 2,
    `fov=${after.fov.toFixed(1)}`);

  const shots = await page.evaluate(() => window.Taierzhuang.Debug.Menu().shotCount);
  Check("东关那一章配了两个机位", shots === 2, `shots=${shots}`);

  // 站在菜单里十秒：不许死人，兵员池不许动（菜单不消耗关卡状态）
  const poolBefore = await page.evaluate(() => window.Taierzhuang.state.nraPool);
  await page.evaluate(() => window.Taierzhuang.StepFrames(600));
  const still = await page.evaluate(() => ({
    alive: window.Taierzhuang.ai.soldiers.filter((s) => s.alive).length,
    deaths: JSON.stringify(window.Taierzhuang.ai.deaths || {}),
    pool: window.Taierzhuang.state.nraPool,
  }));
  Check("菜单里挂十秒：没人死、兵员池没动",
    still.alive === 5 && still.pool === poolBefore,
    `alive=${still.alive} deaths=${still.deaths} pool=${still.pool}/${poolBefore}`);

  // 定时切机位：先把计时归零，再推过一个完整 hold。
  // 不归零时，前面三秒 + 十秒 + 截图等待可能已接近切点；再推 17 秒会跨过**两个**
  // 切点、回到原机位，测试把「切了两次」误报成「一次没切」。
  const first = await page.evaluate(() => {
    window.Taierzhuang.menu.shotTime = 0;
    return window.Taierzhuang.Debug.Menu().shot;
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(17 * 60));
  const second = await page.evaluate(() => window.Taierzhuang.Debug.Menu().shot);
  Check("十六秒后自动切下一个机位", first !== second, `${first} -> ${second}`);
}

// 三个机位各出一张图（视觉审查按图说话）
for (let i = 0; i < 3; i += 1) {
  await page.evaluate((k) => {
    const menu = window.Taierzhuang.menu;
    menu.shotIndex = k;
    menu.shotTime = 0;
    menu.ApplyShot(0.45);
    window.Taierzhuang.StepFrames(4);
  }, i);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `Menu_Title_Shot${i}.png`) });
}

// ===========================================================================
// 3) 选章：真实 DOM / 输入 / 图片与窄屏排版，复用 --levels-only 入口。
// ===========================================================================
await CheckMissionList();

async function CheckMissionList() {
  await page.evaluate(() => window.Taierzhuang.Debug.MenuShow("levels"));
  const panel = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".mnMissionTrack .mnLevel")];
    const rects = rows.map(el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; });
    return {
      levels: document.querySelectorAll("#menu .mnLevel").length,
      retired: [...document.querySelectorAll(".mnSandboxLevel")].some(el => el.textContent.includes("第一关 · 全新策划白盒")),
      groups: [...document.querySelectorAll(".mnLevelGroup b")].map(el=>el.textContent),
      names: rows.map(el=>el.querySelector(".mnLvName").textContent), rects,
      oldMap: !!document.querySelector(".mnMap, .mnTimelineTrack, .mnLvThumb"),
      fullScreen: document.querySelector(".mnPanel").getBoundingClientRect().width === innerWidth,
      title: document.querySelector(".mnPanelTitle").textContent,
    };
  });
  Check("全屏任务选择采用七行纵向清单", panel.fullScreen && panel.title === "任务选择"
    && panel.rects.length === 7 && panel.rects.every((r,i)=>r.x===panel.rects[0].x && (!i||r.y>=panel.rects[i-1].y+panel.rects[i-1].h)),JSON.stringify(panel.rects));
  Check("正式章节与五项测试入口分组保留，旧白盒已移除",panel.levels===12 && !panel.retired&&panel.groups.join(",")==="正式章节,测试场景",panel.groups.join(","));
  Check("任务选择不再出现地图、横向时间轴或缩略图卡",!panel.oldMap);
  const images=[];
  for(let index=0;index<7;index++){
    await page.locator('.mnMissionTrack .mnLevel').nth(index).hover();
    await page.waitForFunction(()=>{const img=document.querySelector('.mnMissionArt img');return img?.complete&&img.naturalWidth>0;});
    const result=await page.evaluate(()=>({selected:window.Taierzhuang.menu.selected,
      title:document.querySelector('.mnBriefTitle').textContent,
      objective:document.querySelector('.mnMissionObjective').textContent,
      image:document.querySelector('.mnMissionArt img').getAttribute('src'),
      current:document.querySelectorAll('.mnLevel[aria-current="true"]').length,
      inMenu:window.Taierzhuang.state.menu}));
    Check("悬停预览章节 "+index,result.selected===index&&result.title===panel.names[index]
      &&result.objective.length>0&&result.current===1&&result.inMenu,JSON.stringify(result));
    images.push(result.image);
  }
  Check("七章原创预览图全部加载且各不相同",new Set(images).size===7);
  await page.mouse.move(2,2);
  await page.evaluate(()=>window.Taierzhuang.menu.SelectLevel(1));
  await page.screenshot({path:path.join(outDir,"Scene_MissionListDesktop.png")});
  await page.keyboard.press('ArrowDown');
  Check("上下键同步选中项、焦点和简报",await page.evaluate(()=>window.Taierzhuang.menu.selected===2
    &&document.activeElement===document.querySelector('.mnLevel.on')&&document.querySelector('.mnBriefTitle').textContent.includes('手榴弹雨')));
  await page.locator('.mnCampaignBack').focus();
  await page.keyboard.press('Enter');
  Check("返回按钮 Enter 确实返回主菜单",await page.evaluate(()=>window.Taierzhuang.menu.mode==='title'&&window.Taierzhuang.state.menu));
  await page.evaluate(()=>{const menu=window.Taierzhuang.menu;menu.OpenPause();menu.Show('levels');});
  await page.keyboard.press('Escape');
  Check("暂停选章的 Esc 返回暂停菜单",await page.evaluate(()=>window.Taierzhuang.menu.mode==='pause'));
  await page.evaluate(()=>{const menu=window.Taierzhuang.menu;menu.ToTitle();menu.Show('levels');
    window.missionOriginalPlay=menu.Play;window.missionPlayed=[];menu.Play=(index)=>window.missionPlayed.push(index);});
  try {
    await page.locator('.mnMissionTrack .mnLevel').nth(3).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.locator('.mnSandboxLevel').nth(1).click();
    Check("鼠标、Enter、测试入口各只触发一次正确任务",await page.evaluate(()=>window.missionPlayed.join(',')==='3,4,8'));
    for (const [name,width,height] of [["Laptop",1280,720],["Mobile",390,844],["Landscape",844,390]]) {
      await page.setViewportSize({width,height});
      await page.mouse.move(1,1);
      await page.evaluate(()=>window.Taierzhuang.menu.SelectLevel(1));
      const layout=await page.evaluate(()=>{
        const panel=document.querySelector('.mnPanel').getBoundingClientRect();
        const back=document.querySelector('.mnCampaignBack').getBoundingClientRect();
        return {panelWidth:panel.width,viewport:innerWidth,backBottom:back.bottom,
          viewportHeight:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
          touchRows:[...document.querySelectorAll('.mnLevel')].every(el=>el.getBoundingClientRect().height>=44)};
      });
      Check(name+"没有横向溢出，返回按钮可达",!layout.overflow&&layout.panelWidth===layout.viewport&&layout.backBottom<=layout.viewportHeight,JSON.stringify(layout));
      if(width<=640)Check("手机任务点击区域至少44px",layout.touchRows);
      await page.screenshot({path:path.join(outDir,"Scene_MissionList"+name+".png")});
      await page.locator('.mnCampaignBack').focus();
      await page.locator('.mnSandboxLevel').last().focus();
      Check(name+"最后一个测试入口能滚动到并选中",await page.evaluate(()=>window.Taierzhuang.menu.selected===11));
      const reopened=await page.evaluate(()=>{
        const menu=window.Taierzhuang.menu;menu.Show('title');menu.Show('levels');
        const row=document.querySelector('.mnLevel.on').getBoundingClientRect();
        const list=document.querySelector('.mnLevelList').getBoundingClientRect();
        return {selected:menu.selected,expected:menu.DefaultLevel(),visible:row.top>=list.top-1&&row.bottom<=list.bottom+1};
      });
      Check(name+"重开选章自动滚回继续章节",reopened.selected===reopened.expected&&reopened.visible,JSON.stringify(reopened));
    }
  } finally {
    await page.evaluate(()=>{window.Taierzhuang.menu.Play=window.missionOriginalPlay;delete window.missionOriginalPlay;});
    await page.setViewportSize({width:1600,height:900});
  }
  await page.evaluate(()=>window.Taierzhuang.menu.SelectLevel(2));
  await page.screenshot({path:path.join(outDir,"Menu_Levels.png")});
}

// ===========================================================================
// 3.5) 战役入口：「开始」要播关前过场，而且**过场必须真的在走**
//
// 这一条是补票。过场没有自己的帧驱动，全靠 Frame() 推；而从菜单进关时
// state.running 还是 false（要等过场播完才 StartRun）——主循环里那道
// 「没在跑就直接 return」曾经把「开始」卡死在出川的黑场里：过场在等一个
// 永远不来的帧，而 StartRun 在等过场结束。选章那条路不播过场，测不到它。
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("start"));
  await page.waitForTimeout(900);
  // 开演前有一段着色器预热（Script_Main.WarmupShaders）：布景已经建好、时间轴被
  // 按住，屏幕上盖着加载画面。这一段几秒到十几秒不等（看机器和驱动的着色器缓存），
  // 所以**不能按固定等待去采时间轴**，要等 Held 放开再采。
  const warming = await page.evaluate(() => ({
    held: !!window.Taierzhuang.cutscene?.Held,
    boot: !document.getElementById("boot").classList.contains("gone"),
    bar: document.querySelector("#bootBar i").style.width,
    step: document.getElementById("bootStep").textContent,
  }));
  Check("预热期间盖着加载画面、进度条在走（不是黑屏干等）",
    !warming.held || (warming.boot && parseFloat(warming.bar) > 0),
    `held=${warming.held} boot=${warming.boot} bar=${warming.bar} step=${warming.step}`);
  await page.waitForFunction(() => window.Taierzhuang.cutscene && !window.Taierzhuang.cutscene.Held,
    null, { timeout: 120000 }).catch(() => {});
  const a = await page.evaluate(() => ({
    playing: !!window.Taierzhuang.cutscene?.Playing,
    id: window.Taierzhuang.state.cutscene,
    t: window.Taierzhuang.cutscene?.time || 0,
  }));
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => window.Taierzhuang.cutscene?.time || 0);
  Check("「开始」播序章那一场过场", a.playing && a.id === "CS_Chuchuan", `id=${a.id} playing=${a.playing}`);
  Check("过场真的在往前走（不是卡在第一帧）", b > a.t + 0.5, `t ${a.t.toFixed(2)} -> ${b.toFixed(2)} s`);
  Check("预热完才开演：头几秒的台词没有在加载画面背后白白流走", a.t < 1.5, `t=${a.t.toFixed(2)} s`);

  // Esc 跳过，别在冒烟里干等三十八秒
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, null, { timeout: 180000 })
    .catch(() => {});
  const done = await page.evaluate(() => ({
    running: window.Taierzhuang.state.running,
    level: window.Taierzhuang.Debug.Level().id,
    open: window.Taierzhuang.Debug.Menu().open,
  }));
  // 序章是过场承载章：车厢播完（或 Esc 跳过）自动接第一章，中间不建自己的切片。
  Check("跳过序章过场之后自动接进第一关", done.running && done.level === "CH1_NanLu" && !done.open,
    `running=${done.running} level=${done.level}`);

  // 回主菜单，下一节从选章再进一次
  await page.evaluate(() => {
    window.Taierzhuang.Debug.Pause();
    window.Taierzhuang.Debug.MenuAct("title");
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(20));
}

// ===========================================================================
// 4) 从选章进关：切片重建、玩法真的跑起来
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuPlay(2));
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, null, { timeout: 180000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(60));
  const inGame = await page.evaluate(() => {
    const T = window.Taierzhuang;
    return {
      running: T.state.running, inMenu: T.state.menu, level: T.Debug.Level().id,
      built: T.state.builtPhase,
      hudHidden: document.getElementById("hud").style.display === "none",
      menuOff: document.getElementById("menu").classList.contains("off"),
      soldiers: T.ai.soldiers.length,
      viewmodel: T.viewmodel.root.visible,
    };
  });
  Check("从选章能进关（第二关 · 手榴弹雨）", inGame.running && inGame.level === "CH2_Shouliudan",
    `running=${inGame.running} level=${inGame.level} built=${inGame.built}`);
  Check("进关后菜单收起、HUD 与枪回来", inGame.menuOff && !inGame.hudHidden && inGame.viewmodel,
    `menuOff=${inGame.menuOff} hud=${!inGame.hudHidden} vm=${inGame.viewmodel}`);
  Check("进关后战场上有人", inGame.soldiers > 4, `soldiers=${inGame.soldiers}`);
  await page.screenshot({ path: path.join(outDir, "Menu_InGame.png") });
}

// ===========================================================================
// 4b) 调试选项必须改到真实玩法，而不只是菜单上的复选框
// ===========================================================================
{
  const mechanics = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.player.health = 35;
    T.player.bleeding = 3;
    T.Debug.SetDebugOption("invincible", true);
    T.player.TakeHit(999, "head");
    const invincible = T.player.Alive && T.player.health === 100 && T.player.bleeding === 0;

    T.Debug.SetDebugOption("infiniteGrenades", true);
    const grenadesBefore = T.state.grenades;
    const throwOriginal = T.combat.Throw;
    T.combat.Throw = () => {};
    T.Debug.Throw("Grenade", 0.2);
    T.combat.Throw = throwOriginal;
    const infiniteGrenades = grenadesBefore >= 1 && T.state.grenades === grenadesBefore;

    T.state.ammo = 0;
    T.Debug.SetDebugOption("infiniteAmmo", true);
    const infiniteAmmo = T.state.ammo > 0;

    T.Debug.SetDebugOption("noCollision", true);
    const x = T.player.position.x;
    const z = T.player.position.z;
    T.player.position.set(x, T.battlefield.GroundHeight(x, z) + 5, z);
    T.player.velocity.set(0, -20, 0);
    T.player.MoveWithCollision(0.5);
    const terrainHeld = Math.abs(T.player.position.y - T.battlefield.GroundHeight(x, z)) < 0.001;

    T.Debug.SetDebugOption("noCollision", false);
    T.Debug.SetDebugOption("invincible", false);
    T.Debug.SetDebugOption("infiniteGrenades", false);
    T.Debug.SetDebugOption("infiniteAmmo", false);
    return { invincible, infiniteGrenades, infiniteAmmo, terrainHeld, options: T.Debug.DebugOptions() };
  });
  Check("无敌、无限补给与无碰撞贴地实际生效",
    mechanics.invincible && mechanics.infiniteGrenades && mechanics.infiniteAmmo && mechanics.terrainHeld,
    JSON.stringify(mechanics));
}

// ===========================================================================
// 5) Esc 暂停 -> 回主菜单 -> 再进一关
// ===========================================================================
{
  // 玩家报上来的那一次手里拿的是**大刀**（3 号槽），走键位表切过去再走整条路：
  // 刀的 rig 是双手抱着的一整块，藏起来时画面上是"整只手连刀一起没了"，
  // 比丢一支步枪显眼得多 —— 出图那一张就是给人眼复核这件事的。
  await page.evaluate(() => { window.Taierzhuang.Debug.Key("Digit3"); });
  await page.evaluate(() => window.Taierzhuang.StepFrames(4));
  const swordUp = await page.evaluate(() => window.Taierzhuang.Debug.Slots());
  Check("先换到大刀（这一段按玩家那次的持械走）",
    swordUp.active === "melee" && swordUp.viewmodel === "Dadao",
    `active=${swordUp.active} viewmodel=${swordUp.viewmodel}`);

  // 以前这里直接调 Debug.Pause()，绕开了真实 Esc 与指针锁，正好漏掉了玩家侧的事故。
  await page.keyboard.press("Escape");
  const paused = await page.evaluate(() => ({
    ...window.Taierzhuang.Debug.Menu(), running: window.Taierzhuang.state.running,
  }));
  Check("Esc 能暂停并显示菜单",
    paused.open && paused.mode === "pause" && !paused.running && paused.items.includes("settings"),
    `mode=${paused.mode} running=${paused.running}`);
  // 暂停要连声音一起停：环境床与音乐是自己在跑的 WebAudio 图，Frame() 停了它们照响
  //（上游 Script_Audio.SetPaused 已经把闸装好了，这里验菜单这条路真的去拉了闸）
  const audioPaused = await page.evaluate(() => window.Taierzhuang.audio.paused);
  Check("暂停时背景音也停了", audioPaused === true, `audio.paused=${audioPaused}`);
  // HUD 必须收起来：顶着阶段条、简报和小地图，暂停菜单读不清（实拍抓到的）
  const hudGone = await page.evaluate(() => getComputedStyle(document.getElementById("hud")).display);
  Check("暂停时 HUD 收起来", hudGone === "none", `display=${hudGone}`);
  // 暂停屏是「冻住的战场 + 一层压暗 + 一列字」：HUD 收起来，但**手里那支枪留着**。
  // 它是画面的一部分，藏了就得有人负责放回来 —— 而「继续」不管这件事。
  const pausedGun = await page.evaluate(() => window.Taierzhuang.viewmodel.root.visible);
  Check("暂停时手里的枪还在画面里", pausedGun === true, `viewmodel=${pausedGun}`);
  // 暂停不许动相机：动了的话回到游戏时玩家会发现自己看着别处
  const camA = await page.evaluate(() => window.Taierzhuang.Debug.Menu().camera);
  await page.waitForTimeout(400);
  const camB = await page.evaluate(() => window.Taierzhuang.Debug.Menu().camera);
  Check("暂停时相机不动", Math.hypot(camB.x - camA.x, camB.y - camA.y, camB.z - camA.z) < 0.001);
  await page.screenshot({ path: path.join(outDir, "Menu_Pause.png") });

  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("settings"));
  const settings = await page.evaluate(() => ({
    editor: window.Taierzhuang.Debug.Editor(),
    menu: window.Taierzhuang.Debug.Menu(),
    running: window.Taierzhuang.state.running,
  }));
  Check("暂停菜单能打开设置，战斗仍冻结",
    settings.editor.panelOpen && settings.menu.mode === "pause" && !settings.running,
    JSON.stringify(settings));
  await page.keyboard.press("Escape");
  const settingsClosed = await page.evaluate(() => ({
    editor: window.Taierzhuang.Debug.Editor(), menu: window.Taierzhuang.Debug.Menu(),
    viewmodel: window.Taierzhuang.viewmodel.root.visible,
  }));
  Check("设置里按 Esc 回到暂停菜单",
    !settingsClosed.editor.panelOpen && settingsClosed.menu.open && settingsClosed.menu.mode === "pause");
  // 从设置回暂停层不能顺手把枪和齿轮藏了：那是**主菜单**的收口（OpenMenu），
  // 抄到暂停这条路上就成了「从设置回来手里空了」——拿大刀时整只手都没了，
  // 而且不换关不重生再也回不来（SwitchSlot 不碰 root.visible）。
  Check("从设置回暂停层，手里的枪与齿轮都还在",
    settingsClosed.viewmodel === true && !settingsClosed.editor.hidden,
    `viewmodel=${settingsClosed.viewmodel} gearHidden=${settingsClosed.editor.hidden}`);

  // 玩家说的「点击了设置界面」指的是真的点**进**操作 / 画质 / 音效那三页，
  // 不是只把入口面板叫出来 —— 三页各自那个 × 走的是 host.Close()，
  // 与关掉整块面板同一条收口（Close → FinishEditorSession）。
  // 逐页开→关走一遍，每一步大刀都必须还在手里：只验入口面板会整段漏掉这条路。
  for (const id of ["controls", "graphics", "sound"]) {
    await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("settings"));
    await page.evaluate((editorId) => {
      document.querySelector(`#edRoot .edBtn[data-editor="${editorId}"]`).click();
    }, id);
    await page.evaluate(() => window.Taierzhuang.StepFrames(2));
    const on = await page.evaluate(() => ({
      active: window.Taierzhuang.Debug.Editor().active,
      visible: window.Taierzhuang.viewmodel.root.visible,
      weapon: window.Taierzhuang.Debug.Slots().viewmodel,
    }));
    Check(`点进设置·${id} 时大刀还在手里`,
      on.active === id && on.visible === true && on.weapon === "Dadao", JSON.stringify(on));
    // 点这一页自己的 ×（不是面板的 ×，也不是 Esc）：玩家最常用的那个关法
    await page.evaluate(() => {
      document.querySelector("#edRoot .edPanel.work .edX").click();
    });
    await page.evaluate(() => window.Taierzhuang.StepFrames(2));
    const off = await page.evaluate(() => ({
      active: window.Taierzhuang.Debug.Editor().active,
      mode: window.Taierzhuang.Debug.Menu().mode,
      visible: window.Taierzhuang.viewmodel.root.visible,
      weapon: window.Taierzhuang.Debug.Slots().viewmodel,
    }));
    Check(`关掉设置·${id} 回暂停层，大刀还在手里`,
      off.active === null && off.mode === "pause"
        && off.visible === true && off.weapon === "Dadao", JSON.stringify(off));
  }
  await page.evaluate(() => window.Taierzhuang.Debug.CloseEditor());

  // 实际复现玩家路径：暂停 → 设置 → 构件库预览。过去只有场景/地形工具会
  // 收起暂停菜单，摄影棚类编辑器会把「继续 / 设置 / 调试选项」叠在背景里。
  // 所有编辑器接管后都必须整层隐藏菜单；关闭工具后再回原暂停层，不能恢复战斗。
  await page.evaluate(() => {
    window.Taierzhuang.Debug.MenuAct("settings");
    window.Taierzhuang.Debug.OpenEditor("props");
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(4));
  const propEditorOpen = await page.evaluate(() => ({
    editor: window.Taierzhuang.Debug.Editor(),
    menu: window.Taierzhuang.Debug.Menu(),
    menuDisplay: getComputedStyle(document.getElementById("menu")).display,
    running: window.Taierzhuang.state.running,
  }));
  Check("构件库编辑器打开时暂停菜单整层隐藏",
    propEditorOpen.editor.active === "props" && !propEditorOpen.menu.open
      && propEditorOpen.menuDisplay === "none" && !propEditorOpen.running,
    JSON.stringify(propEditorOpen));
  await page.screenshot({ path: path.join(outDir, "Menu_PropEditorFromPause.png") });

  await page.evaluate(() => window.Taierzhuang.Debug.CloseEditor());
  const propEditorClosed = await page.evaluate(() => ({
    editor: window.Taierzhuang.Debug.Editor(),
    menu: window.Taierzhuang.Debug.Menu(),
    menuDisplay: getComputedStyle(document.getElementById("menu")).display,
    running: window.Taierzhuang.state.running,
  }));
  Check("关闭构件库编辑器后恢复原暂停菜单",
    !propEditorClosed.editor.capturing && propEditorClosed.menu.open
      && propEditorClosed.menu.mode === "pause" && propEditorClosed.menuDisplay !== "none"
      && !propEditorClosed.running,
    JSON.stringify(propEditorClosed));

  // 按「继续」时设置面板还开着是常事：关掉某一页设置只关那一页，入口面板留着。
  // 不收掉它 editor.Capturing 就一直是 true —— Frame 走的还是编辑器那条分支
  //（世界冻着）、每一次点击都被当成"在点面板"吃掉、指针锁也不去抢。
  // 玩家看到的是「回到了战斗但镜头和身体都不听话」。
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("settings"));
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("resume"));
  await page.evaluate(() => window.Taierzhuang.StepFrames(4));
  const resumed = await page.evaluate(() => ({
    running: window.Taierzhuang.state.running, open: window.Taierzhuang.Debug.Menu().open,
    editor: window.Taierzhuang.Debug.Editor(),
    locked: window.Taierzhuang.Debug.PointerLock().locked,
  }));
  Check("暂停里的「继续」能回到游戏", resumed.running && !resumed.open, JSON.stringify(resumed));
  Check("「继续」把还开着的设置面板一并收掉（否则世界还冻着、点击全被吃）",
    !resumed.editor.panelOpen && !resumed.editor.capturing && resumed.locked === true,
    JSON.stringify(resumed.editor) + ` locked=${resumed.locked}`);
  const audioBack = await page.evaluate(() => window.Taierzhuang.audio.paused);
  Check("继续之后背景音接回来", audioBack === false, `audio.paused=${audioBack}`);
  const hudBack = await page.evaluate(() => getComputedStyle(document.getElementById("hud")).display);
  Check("继续之后 HUD 回来", hudBack !== "none", `display=${hudBack}`);
  // 这一整段走的正是玩家报的那条路：暂停 → 设置 → 构件库 → 关掉 → 继续。
  // 收口断在哪一步这里都红：回到战斗时手里必须还有枪。
  await page.evaluate(() => window.Taierzhuang.StepFrames(8));
  const gunBack = await page.evaluate(() => ({
    visible: window.Taierzhuang.viewmodel.root.visible, ...window.Taierzhuang.Debug.Slots(),
  }));
  Check("从设置/编辑器回来再「继续」，大刀还在手里",
    gunBack.visible === true && gunBack.viewmodel === "Dadao",
    `visible=${gunBack.visible} viewmodel=${gunBack.viewmodel}`);
  await page.screenshot({ path: path.join(outDir, "Menu_ResumeAfterSettings.png") });

  const unlockPause = await page.evaluate(() => {
    window.Taierzhuang.Debug.DropPointerLock();
    return {
      menu: window.Taierzhuang.Debug.Menu(),
      running: window.Taierzhuang.state.running,
    };
  });
  Check("浏览器吞掉 Esc、只解除指针锁时也会暂停",
    unlockPause.menu.open && unlockPause.menu.mode === "pause" && !unlockPause.running,
    JSON.stringify(unlockPause));
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("resume"));

  await page.evaluate(() => {
    window.Taierzhuang.Debug.Pause();
    window.Taierzhuang.Debug.MenuAct("title");
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
  const back = await page.evaluate(() => window.Taierzhuang.Debug.Menu());
  Check("从暂停能回主菜单，并且换成当前切片的机位",
    back.open && back.live && back.slice === 2 && back.shotCount >= 2,
    `slice=${back.slice} shot=${back.shot}`);
}

// ===========================================================================
// 5b) 齿轮设置 -> 返回主菜单
// ===========================================================================
{
  await page.evaluate(() => window.Taierzhuang.Debug.MenuPlay(2));
  await page.waitForFunction(() => window.Taierzhuang.state.running === true, null, { timeout: 180000 });
  await page.keyboard.press("Backquote");
  const option = await page.evaluate(() => ({
    panelOpen: window.Taierzhuang.Debug.Editor().panelOpen,
    text: document.querySelector('[data-action="main-menu"]')?.textContent || "",
  }));
  Check("设置菜单里有返回主菜单选项",
    option.panelOpen && option.text.trim() === "返回主菜单", JSON.stringify(option));

  await page.click('[data-action="main-menu"]');
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
  const returned = await page.evaluate(() => ({
    menu: window.Taierzhuang.Debug.Menu(),
    editor: window.Taierzhuang.Debug.Editor(),
    running: window.Taierzhuang.state.running,
    inMenu: window.Taierzhuang.state.menu,
    hudHidden: document.getElementById("hud").style.display === "none",
  }));
  Check("设置菜单能直接回到主菜单",
    returned.menu.open && returned.menu.live && returned.inMenu && !returned.running
      && !returned.editor.capturing && returned.hudHidden,
    `open=${returned.menu.open} running=${returned.running} editor=${returned.editor.capturing}`);
}

// ===========================================================================
// 6) 进度：通过一关之后，菜单的第一项变成「继续」，选章里标「已通过」
// ===========================================================================
{
  await page.evaluate(() => {
    localStorage.setItem("tengxian1938_progress_v2",
      JSON.stringify({ cleared: ["CH0_Chuchuan", "CH1_NanLu"], furthest: 2 }));
  });
  await Boot();
  const m = await page.evaluate(() => {
    window.Taierzhuang.Debug.MenuShow("levels");
    return {
      first: document.querySelector("#menu .mnItem .mnItemLabel").textContent,
      marks: [...document.querySelectorAll("#menu .mnLevel .mnLvMark")].map((e) => e.textContent),
      selected: window.Taierzhuang.Debug.Menu().selected,
      progress: window.Taierzhuang.Debug.Menu().progress,
    };
  });
  Check("有进度时第一项是「继续」", m.first.startsWith("继续"), m.first);
  Check("打过的两章标「已通过」，下一章标「下一关」",
    m.marks[0] === "已通过" && m.marks[1] === "已通过" && m.marks[2] === "下一关",
    m.marks.join("|"));
  Check("选章默认落在下一关上", m.selected === 2, `selected=${m.selected}`);
  await page.evaluate(() => window.Taierzhuang.Debug.ResetProgress());
}

// ===========================================================================
// 7) ?menu=0 与 ?shot=1 两条旁路照旧（三个老冒烟都靠它们）
// ===========================================================================
{
  await page.goto(Url("&menu=0&phase=0"), { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  const bypass = await page.evaluate(() => ({
    menu: !!window.Taierzhuang.menu,
    inMenu: window.Taierzhuang.state.menu,
    bootVisible: !document.getElementById("boot").classList.contains("gone"),
    startEnabled: !document.getElementById("bootStart").disabled,
  }));
  Check("?menu=0 不建菜单，「进 城」照旧",
    !bypass.menu && !bypass.inMenu && bypass.bootVisible && bypass.startEnabled,
    JSON.stringify(bypass));
  await page.click("#bootStart");
  await page.waitForTimeout(300);
  const started = await page.evaluate(() => window.Taierzhuang.state.running);
  Check("?menu=0 下点「进 城」能进游戏", started);
}

// ===========================================================================
// 7.5) 选章末尾那条沙盒：靶场
//
// 靶场不在 PHASES 里，进出都是**重载页面**（PHASE_TABLE 在 ?range=1 下整表替换）。
// 所以这一节要验的是三段：简报（不画那张滕县全图）、进得去（真到了靶场）、
// 退得出（暂停里那条「退出靶场」把 range 摘掉、回到主菜单）。
// ===========================================================================
{
  await Boot();
  const brief = await page.evaluate(() => {
    window.Taierzhuang.Debug.MenuShow("levels");
    const menu = window.Taierzhuang.menu;
    const rangeIndex = menu.entries.findIndex((entry) => entry.id === "Range"
      || entry.sandboxKey === "range");
    menu.SelectLevel(rangeIndex);
    return {
      selected: window.Taierzhuang.Debug.Menu().selected,
      title: document.querySelector("#menu .mnBriefTitle")?.textContent || "",
      mark: document.querySelector("#menu .mnSandboxLevel.on .mnLvMark")?.textContent || "",
      no: document.querySelector("#menu .mnSandboxLevel.on .mnLvNo")?.textContent || "",
      sandboxes: [...document.querySelectorAll("#menu .mnSandboxLevel")].map((entry) => ({
        no: entry.querySelector(".mnLvNo")?.textContent || "",
        name: entry.querySelector(".mnLvName")?.textContent || "",
        mark: entry.querySelector(".mnLvMark")?.textContent || "",
      })),
      map: !!document.querySelector("#menu .mnMap"),
      objective: document.querySelector("#menu .mnMissionObjective")?.textContent || "",
      go: !!document.querySelector("#menu .mnGo"),
    };
  });
  Check("靶场条目排在七章之后，标「沙盒」",
    brief.selected === 8 && brief.mark === "沙盒" && brief.no === "靶",   // 枪械专项后保留原玩法靶场
    `selected=${brief.selected} mark=${brief.mark} no=${brief.no}`);
  Check("选章列出枪械、玩法、爆炸、白刃独立战斗与第一关策划白盒",
    brief.sandboxes.length === 5
      && brief.sandboxes.map((entry) => entry.no).join(",") === "枪,靶,爆,刃,012"
      && brief.sandboxes.every((entry) => entry.mark === "沙盒")
      && brief.sandboxes[0].name.includes("枪械白盒靶场")
      && brief.sandboxes[1].name.includes("玩法测试靶场")
      && brief.sandboxes[2].name.includes("爆炸测试场")
      && brief.sandboxes[3].name.includes("白刃战 · 大刀与刺刀")
      && brief.sandboxes[4].name.includes("第一关 · P0/P1/P2 场景白盒")
      && brief.sandboxes.every((entry) => !entry.name.includes("界河")),
    JSON.stringify(brief.sandboxes));
  Check("靶场预览只留一句目标、没有二次确认按钮，且**不画**滕县全图",
    brief.title === "玩法测试靶场" && brief.objective.length > 0 && !brief.go && !brief.map,
    `${brief.title} / ${brief.objective} / go=${brief.go} / map=${brief.map}`);
  await page.screenshot({ path: path.join(outDir, "Menu_Levels_Range.png") });

  // 单击已选中的靶场卡片直接整页重载，等新页面把 Debug.Range 挂出来
  await page.click("#menu .mnSandboxLevel.on");
  await page.waitForFunction(() => window.Taierzhuang?.Debug?.Range !== undefined,
    null, { timeout: 240000 });
  const entered = await page.evaluate(() => ({
    range: new URL(location.href).searchParams.get("range"),
    level: window.Taierzhuang.Debug.Level().id,
    stations: window.Taierzhuang.Debug.Range.State().stations.length,
    menu: !!window.Taierzhuang.menu,
    menuOpen: window.Taierzhuang.Debug.Menu().open,
    rootOff: document.getElementById("menu").classList.contains("off"),
    bootStart: !document.getElementById("bootStart").disabled,
  }));
  Check("从选章进得去靶场（?range=1，场上是靶场那一关）",
    entered.range === "1" && entered.level === "Range" && entered.stations === 3,
    `range=${entered.range} level=${entered.level} stations=${entered.stations}`);
  Check("靶场里菜单只建不开（开机不许一屏标题盖在场地上）",
    entered.menu && !entered.menuOpen && entered.rootOff && entered.bootStart,
    JSON.stringify(entered));

  // 进游戏，再按 Esc 看暂停菜单换没换成沙盒那一套
  await page.click("#bootStart");
  await page.waitForTimeout(400);
  const paused = await page.evaluate(() => {
    window.Taierzhuang.Debug.Pause();
    return {
      items: window.Taierzhuang.Debug.Menu().items,
      labels: [...document.querySelectorAll("#menu .mnItemLabel")].map((e) => e.textContent),
    };
  });
  Check("靶场的暂停菜单是「继续/设置/调试选项/退出靶场」（不给当场换不了的选章与主菜单）",
    paused.items.join(",") === "resume,settings,debug,exitSandbox"
      && paused.labels.includes("退出靶场"),
    paused.items.join(" / "));

  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("exitSandbox"));
  await page.waitForFunction(
    () => window.Taierzhuang?.Debug?.Menu !== undefined
      && window.Taierzhuang.Debug.Range === undefined,
    null, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(20));
  const back = await page.evaluate(() => ({
    range: new URL(location.href).searchParams.get("range"),
    open: window.Taierzhuang.Debug.Menu().open,
    mode: window.Taierzhuang.Debug.Menu().mode,
    level: window.Taierzhuang.Debug.Level().id,
  }));
  Check("「退出靶场」摘掉 range，回到主菜单",
    back.range === null && back.open && back.mode === "title" && back.level !== "Range",
    `range=${back.range} mode=${back.mode} level=${back.level}`);

  await page.evaluate(() => {
    window.Taierzhuang.Debug.MenuShow("levels");
    const menu = window.Taierzhuang.menu;
    menu.SelectLevel(menu.entries.findIndex(entry => entry.sandboxKey === "explosions"));
  });
  await page.click("#menu .mnSandboxLevel.on");
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && window.Taierzhuang.Debug.Level().id === "ExplosionRange",
    null, { timeout: 240000 });
  const explosionEntered = await page.evaluate(() => ({
    query: new URL(location.href).searchParams.get("explosions"), open: window.Taierzhuang.Debug.Menu().open,
    scene: window.Taierzhuang.Debug.Explosions.State(),
  }));
  Check("爆炸场菜单卡进入独立场地，默认没有飞机盘旋",
    explosionEntered.query === "1" && !explosionEntered.open && explosionEntered.scene.visibleAircraft.length === 0,
    JSON.stringify(explosionEntered));
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("exitSandbox"));
  await page.waitForFunction(() => window.Taierzhuang?.Debug?.Menu?.()?.mode === "title"
    && !new URL(location.href).searchParams.has("explosions"), null, { timeout: 240000 });
  Check("退出爆炸场回到主菜单", await page.evaluate(() => window.Taierzhuang.Debug.Menu().open));

  await page.evaluate(() => {
    window.Taierzhuang.Debug.MenuShow("levels");
    const menu = window.Taierzhuang.menu;
    menu.SelectLevel(menu.entries.findIndex(entry => entry.sandboxKey === "firstLevelP012Whitebox"));
  });
  await page.click("#menu .mnSandboxLevel.on");
  await page.waitForFunction(() => window.Taierzhuang?.Debug?.P012?.()?.beat === "B00",
    null, { timeout: 240000 });
  const p012Entered = await page.evaluate(() => ({
    query: new URL(location.href).searchParams.get("whitebox"),
    phase: window.Taierzhuang.Debug.Whitebox().phase,
    open: window.Taierzhuang.Debug.Menu().open,
  }));
  Check("P012 菜单卡实际进入保留的独立白盒",
    p012Entered.query === "p012" && p012Entered.phase === "FirstLevelP012Whitebox" && !p012Entered.open,
    JSON.stringify(p012Entered));
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("exitSandbox"));
  await page.waitForFunction(() => window.Taierzhuang?.Debug?.Menu?.()?.mode === "title"
    && !new URL(location.href).searchParams.has("whitebox"), null, { timeout: 240000 });
  Check("P012 退出独立测试后回主菜单", await page.evaluate(() => window.Taierzhuang.Debug.Menu().open));
}

// ===========================================================================
// 8) 七章的菜单机位各出一张图（--shots）
// ===========================================================================
if (withShots) {
  for (let phase = 0; phase < 7; phase += 1) {
    await Boot(`&phase=${phase}`);
    const info = await page.evaluate(() => window.Taierzhuang.Debug.Menu());
    for (let k = 0; k < info.shotCount; k += 1) {
      await page.evaluate((i) => {
        const menu = window.Taierzhuang.menu;
        menu.shotIndex = i;
        menu.shotTime = 0;
        menu.ApplyShot(0.45);
        window.Taierzhuang.StepFrames(90);
      }, k);
      await page.waitForTimeout(300);
      const id = await page.evaluate(() => window.Taierzhuang.Debug.Menu().shot);
      await page.screenshot({ path: path.join(outDir, `Menu_P${phase}_${id}.png`) });
      console.log(`     图：Menu_P${phase}_${id}.png`);
    }
  }
}

if (problems.length) {
  console.log("\n控制台/页面报错：");
  for (const p of problems.slice(0, 8)) console.log("   " + p);
  failed += problems.length;
}

await browser.close();
server.close();
console.log(failed ? `\n主菜单冒烟：${failed} 条失败` : "\n主菜单冒烟：全绿");
process.exit(failed ? 1 : 0);
