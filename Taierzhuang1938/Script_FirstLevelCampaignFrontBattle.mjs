// Continuous 03–05 input driver; --stage-from=3 initializes once, never jumps between stages.
// --stage-from=4 / 5 cold-start the 04 / 05 checkpoints (missionStage=4|5, where a death or chapter select puts the
// player) and drive on from the same point of this script a continuous run reaches them at.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { FRONT_SORTIE as S, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { CampaignActions, Snapshot03Entry, Report03Damage } from "./Script_FirstLevelCampaignKit.mjs";
import { DriveBundleThrow } from "./Script_FirstLevelBundleThrowDriver.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { InstallSpeakerActing, CheckFrontActing } from "./Script_FirstLevelCampaignOpening.mjs";

export async function DriveFrontBattle(ctx){
  const {page,output}=ctx,{Route,Interact,WaitStage,CaptureFocus}=CampaignActions(ctx);
  async function State(){return page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());}
  async function WaitFact(fact,seconds=120,fight=false){
    let state;
    for(let i=0;i<seconds;i+=5){
      state=await page.evaluate(({fact,fight})=>{
        const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
        window.MissionInputDriver.leg="WaitFact:"+fact;window.MissionInputDriver.mode="hold";
        for(let f=0;f<300&&g.player.alive&&!r.Has(fact);f++){
          const foe=fight?window.MissionInputDriver.Target(90):null;
          if(foe)window.MissionInputDriver.Shoot(foe);else {g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);}
          if(g.player.bleeding&&g.player.health<80)g.Debug.Key("KeyB");
          g.StepFrames(1,1/60,false);
        }
        g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
        return {alive:g.player.alive,health:g.player.health,mission:g.Debug.FirstLevelMission(),
          actors:[...r.squad,...(r.opening.zhou?[r.opening.zhou]:[])].map(a=>({id:a.castId||a.missionId,alive:a.alive,x:a.position.x,z:a.position.z,goal:a.goal}))};
      },{fact,fight});
      if(i%20===0||!state.alive)console.log("FRONT_FACT",JSON.stringify({fact,time:state.mission.time,health:state.health,remaining:state.mission.remaining,front:state.mission.frontBattle,actors:state.actors}));
      if(state.mission.facts.includes(fact)||!state.alive)break;
    }
    await fs.writeFile(path.join(output,`Data_${fact}.json`),JSON.stringify(state,null,2));
    assert.ok(state.alive,`${fact}: player survives`);assert.ok(state.mission.facts.includes(fact),`${fact}: physical event completes`);
    return state.mission;
  }
  // 在阵位里等（03 等进 04、04 等压住阵位）：躲手榴弹（EvadeGrenade）照常躲，躲完离座位 3 m 以上就走回来。
  // 2026-09-24 实测：躲雷把人甩到阵位东墙外 (34,−139)/(35,−147)/(42,−141)，一直站在那儿等，
  // 03 末尾战车开到、04 战车机枪都打得到那儿（探针 3 次里 1 次死在 03 的 (35.4,−147.5)）。玩家躲完会回掩体。
  async function ReturnToSeat(label){
    const off=await page.evaluate(({x,z})=>{const p=window.Tengxian.player.position;return {d:Math.hypot(p.x-x,p.z-z),x:p.x,z:p.z,alive:window.Tengxian.player.alive};},S.seat);
    if(!off.alive||off.d<=3)return;
    // 东墙（x 33.5，z −140…−132）外面的人从墙南头绕回来（他也是从那儿被甩出去的）。
    // 西墙（RightNestWestLow，x 23.65…24.35，z −156.8…−151.8）外面的人从西门回来（09-24 探针：躲雷甩到 (23.3,−153.9)，
    // 直线回座位顶在那道矮墙上三个 chunk 不动）。
    const west=off.x<24.4&&off.z<-151.2;
    // Only north of the yard's north wall (z −145.6): a dodge inside the yard's east half (09-24 chain R: 34.9,−153.1)
    // walked the east-wall detour straight into that wall and stalled there.
    const east=off.x>32.5&&off.z>-145.2;
    await Route(east?[{x:off.x,z:-141.8},{x:30,z:-141.8},S.seat]:west?[{x:off.x,z:Space.westDoor.z},Space.westDoor,S.seat]:[S.seat],label,{stance:"crouch",fight:true,recoverAfterEvade:true});
  }
  // Who stands where when 04 / 05 begin. The same probe runs on a continuous drive (at the 03→04 and 04→05
  // transitions) and on a checkpoint start, with the same asserts, so the checkpoint cannot drift from the game a
  // player reaches it through (FrontPacingTest ⑦b is its pure-node twin: Zhou already off the gun, He on it,
  // nobody sharing a spawn).
  async function EntryState(stage,source){
    const s=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),m=g.Debug.FirstLevelMission();
      const at=a=>a?{x:+a.position.x.toFixed(2),z:+a.position.z.toFixed(2),alive:!!a.alive}:null;
      const he=r.companion.Handle("heyoutian"),luo=r.companion.Handle("luo"),zhou=r.opening.zhou,gun=r.emplacement.Emplacement(r.leftGunId);
      return {stage:m.stage,time:+m.time.toFixed(1),
        player:{...at(g.player),health:+g.player.health.toFixed(1),bandages:g.player.bandages,ammo:g.state.ammo,clips:g.state.clips,grenades:g.state.grenades},
        he:{...at(he),onLeftGun:!!gun&&!!he&&gun.npc===he},zhou:zhou?{...at(zhou),onLeftGun:!!gun&&gun.npc===zhou}:null,luo:at(luo),
        guards:r.guards.map(x=>({id:x.actor.id,alive:!!x.actor.alive,safe:!!x.safe,x:+x.actor.position.x.toFixed(2),z:+x.actor.position.z.toFixed(2),
          hold:x.actor.holdZone?{x:+x.actor.holdZone.x.toFixed(2),z:+x.actor.holdZone.z.toFixed(2)}:null,end:x.route.at(-1)})),
        tank:{state:m.tankBrain?.brain?.state??null,immobilized:!!m.tank.immobilized,x:+m.tank.x.toFixed(1),z:+m.tank.z.toFixed(1),damageLog:m.tankBrain?.brain?.damageLog??[]},
        // Awake enemies by encounter (alive / total), to compare what a checkpoint start leaves alive with a run.
        enemies:m.enemies.filter(e=>!e.dormant).reduce((out,e)=>{const k=e.encounter||"other",row=out[k]||={alive:[],dead:0};
          if(e.alive)row.alive.push(`${e.id}@${e.x.toFixed(0)},${e.z.toFixed(0)}`);else row.dead++;return out;},{}),
        facts:m.facts};
    });
    const D=(a,b)=>a&&b?+Math.hypot(a.x-b.x,a.z-b.z).toFixed(2):null;
    s.source=source;
    s.distances={zhouFromLeftSeat:s.zhou?.alive?D(s.zhou,S.leftSeat):null,zhouFromHe:s.zhou?.alive?D(s.zhou,s.he):null,
      luoFromPlayer:D(s.luo,s.player),playerFromSeat:D(s.player,S.seat),playerFromRear:D(s.player,S.rear)};
    console.log("STAGE_ENTRY",JSON.stringify({stage,source,time:s.time,player:s.player,he:s.he,zhou:s.zhou,luo:s.luo,distances:s.distances,
      guards:s.guards.map(x=>x.alive?(x.safe?"safe":"out"):"dead").join(","),tank:{state:s.tank.state,x:s.tank.x,z:s.tank.z},
      enemiesAlive:Object.fromEntries(Object.entries(s.enemies).map(([k,v])=>[k,`${v.alive.length}/${v.alive.length+v.dead}`]))}));
    console.log("STAGE_ENTRY_ENEMIES",JSON.stringify({stage,source,enemies:Object.fromEntries(Object.entries(s.enemies).map(([k,v])=>[k,v.alive]))}));
    await fs.writeFile(path.join(output,`Data_Entry${stage}_${source}.json`),JSON.stringify(s,null,2));
    const why=" ("+source+"): "+JSON.stringify({he:s.he,zhou:s.zhou,distances:s.distances,guards:s.guards,tank:s.tank.state});
    assert.equal(s.stage,stage,"entry state sampled inside "+stage+why);
    for(const fact of ["rightNestCaptured","leftGunHandover","zhouLeftGun"])assert.ok(s.facts.includes(fact),`${stage} begins with ${fact}`+why);
    assert.ok(s.he.alive&&s.he.onLeftGun,`${stage} begins with He on the left gun`+why);
    assert.ok(!s.zhou?.onLeftGun,`${stage} begins with Zhou off the left gun`+why);
    // Zhou walks the exit route away from the gun (03's zhouLeftGun is B.zhouLeftGunM); never stacked on He.
    if(s.zhou?.alive){
      assert.ok(s.distances.zhouFromLeftSeat>=B.zhouLeftGunM-.5,`${stage} begins with Zhou past the ${B.zhouLeftGunM} m line`+why);
      assert.ok(s.distances.zhouFromHe>=1,`${stage} begins with Zhou and He apart`+why);
    }
    // The rifle batch is home (the alive ones), at least one of them made it; the tank is still whole.
    const first=s.guards.slice(0,2);
    assert.ok(first.some(x=>x.alive)&&first.filter(x=>x.alive).every(x=>x.safe),`${stage} begins with the first guard batch safe`+why);
    // ... and holding in the safe zone, not anchored back on the front-trench post he left (a checkpoint start
    // once marked them safe but left the hold on the post: they walked back and died to the 05 tank).
    for(const x of s.guards.filter(x=>x.alive&&x.safe))
      assert.ok(x.hold&&D(x.hold,x.end)<=3&&D(x,x.end)<=4,`${stage} begins with safe guard ${x.id} holding the safe zone`+why);
    assert.ok(s.tank.state==null||s.tank.state==="Intact",`${stage} begins with the tank intact`+why);
    assert.ok(!s.tank.immobilized,`${stage} begins with the tank still moving`+why);
    if(stage==="MachineGun"){
      assert.ok(s.guards.slice(2).some(x=>x.alive&&!x.safe),"04 begins with the second guard batch still out"+why);
      if(source==="checkpoint")assert.ok(s.distances.playerFromSeat<=4,"04 begins with the player in the right nest"+why);
    }
    if(stage==="Tank"){
      for(const fact of ["tankPositionPressured","rightRearReached","bundleOrderHeard"])assert.ok(s.facts.includes(fact),`05 begins with ${fact}`+why);
      if(source==="checkpoint")assert.ok(s.distances.playerFromRear<=B.rearArrivalM+1,"05 begins with the player at the right rear junction"+why);
    }
    return s;
  }
  async function HoldNest({stage=null,fact=null},seconds,label){
    let state;
    for(let i=0;i<seconds;i+=5){
      state=await page.evaluate(({stage,fact})=>{
        const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),Done=()=>stage?r.flow.stage.id===stage:r.Has(fact);
        window.MissionInputDriver.leg="HoldNest:"+(stage||fact);window.MissionInputDriver.mode="hold";
        let evaded=false;
        for(let f=0;f<300&&g.player.alive&&!Done();f++){
          const evading=window.MissionInputDriver.EvadeGrenade();evaded||=evading;
          const foe=evading?null:window.MissionInputDriver.Target(90);
          if(foe)window.MissionInputDriver.Shoot(foe);
          else if(!evading){g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
            if(g.state.activeSlot==="melee")g.Debug.Key("Digit1");if(g.state.ammo===0)g.Debug.Key("KeyR");}
          if(g.player.bleeding&&g.player.health<80)g.Debug.Key("KeyB");
          g.StepFrames(1,1/60,false);
        }
        g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
        return {alive:g.player.alive,health:g.player.health,done:Done(),evaded,mission:g.Debug.FirstLevelMission()};
      },{stage,fact});
      if(state.done||!state.alive)break;
      await ReturnToSeat(label);
    }
    const what=stage||fact;
    if(fact)await fs.writeFile(path.join(output,`Data_${fact}.json`),JSON.stringify(state,null,2));
    assert.ok(state.alive,`${what}: player survives in the nest`);assert.ok(state.done,`${what}: reached while holding the nest`);
    return state;
  }
  // Who hit the player (a cold start at 03 skips the 01 hook in Script_FirstLevelMissionBrowserTest): every Capture
  // writes the last 12 into its Data_*.json (CampaignKit), so a death on a leg says which shooter did it.
  await page.evaluate(()=>{
    if(window.missionDamage)return;
    const g=window.Tengxian,original=g.player.TakeHit.bind(g.player);window.missionDamage=[];
    g.player.TakeHit=(damage,part,direction,info)=>{
      const before=g.player.health,result=original(damage,part,direction,info),from=info?.from;let who=null,best=2.5;
      if(from)for(const s of g.ai.soldiers){const d=Math.hypot(s.position.x-from.x,s.position.z-from.z);if(s.side==="ija"&&d<best){best=d;who=s.missionId||String(s.id);}}
      window.missionDamage.push({time:+(g.Debug.FirstLevelMission()?.time??0).toFixed(1),stage:g.Debug.FirstLevelMission()?.stage,lost:+(before-g.player.health).toFixed(1),
        who,blast:!!info?.blast,bullet:!!info?.bullet,from:from?.toArray?.().map(v=>+v.toFixed(1)),at:g.player.position.toArray().map(v=>+v.toFixed(1))});
      if(window.missionDamage.length>120)window.missionDamage.shift();
      return result;
    };
  });
  const checkpoint=ctx.stageFrom===4?"MachineGun":ctx.stageFrom===5?"Tank":null;
  assert.equal((await State()).stage,checkpoint||"Support");
  // Luo's front commands (03) are sampled from here (a run from 01 installed the sampler at RearTrench already).
  if(!checkpoint)await InstallSpeakerActing(page);
  // What the player carries into 03 (a run from 01 vs a cold start at 03): CAMPAIGN_03_ENTRY / CAMPAIGN_03_DAMAGE.
  if(!checkpoint){ctx.snapshot03=await Snapshot03Entry(ctx,ctx.stageFrom===3?"cold":"continuous");}
  try{await DriveLegs();}
  catch(error){
    // Where the body stood when a leg failed: colliders and people within reach, keys, the route bot, the damage log
    // (09-24: two idle-probe drives stalled 1.8 m short of the nest's rear door on WestDoorGapWatch).
    const stuck=await page.evaluate(()=>{
      const g=window.Tengxian,p=g.player,at=p.position,near=(x,z,m)=>Math.hypot(x-at.x,z-at.z)<m;
      const colliders=(g.battlefield.colliders||[]).filter(b=>b?.c&&b?.h&&Math.abs(b.c[0]-at.x)<b.h[0]+b.h[2]+1.5&&Math.abs(b.c[2]-at.z)<b.h[0]+b.h[2]+1.5).slice(0,16)
        .map(b=>({id:b.id||null,tag:b.tag||null,c:b.c.map(v=>+v.toFixed(2)),h:b.h.map(v=>+v.toFixed(2)),ry:b.ry||0}));
      const people=g.ai.soldiers.filter(s=>near(s.position.x,s.position.z,2.5)).map(s=>({id:s.missionId||s.castId||s.id,side:s.side,alive:s.alive,x:+s.position.x.toFixed(2),z:+s.position.z.toFixed(2)}));
      return {position:at.toArray().map(v=>+v.toFixed(2)),stance:p.stance,health:p.health,keys:[...(g.Debug.KeysDown?.()||[])],
        routeBot:window.routeBot?{index:window.routeBot.index,target:window.routeBot.points?.[window.routeBot.index],stalled:window.routeBot.stalled}:null,
        ground:g.battlefield.GroundHeight(at.x,at.z),colliders,people,damage:window.missionDamage?.slice(-20),
        // A mission failure freezes the body exactly like a stall (09-24 TankProbe run N: the second guard batch died
        // to tank shells while the player walked the ammo branch; the route reported "stalled"). Name it here.
        failure:(()=>{const r=g.Debug.FirstLevelMissionRuntime(),facts=[...r.flow.facts].filter(f=>/^(guardBatchLost|zhouGunKilled)$/.test(f));
          return {facts,guards:(r.guards||[]).map(x=>x.actor.alive?Math.round(x.actor.health):0),menu:document.querySelector('#pauseMenu, .pauseMenu')?.innerText?.slice(0,80)??null};})(),
        impacts:(g.Debug.FirstLevelMissionRuntime().tank?.impacts||[]).filter(i=>near(i.x,i.z,5)),
        interaction:(()=>{const q=g.interact?.Query?.(g.player);return {query:q?{kind:q.kind,label:q.label,tag:q.point?.tag??null,id:q.point?.id??null,dist:q.dist}:null,
          prompts:(g.hud?.actionPrompts||[]).map(p=>p.label),text:document.querySelector('.actionText')?.textContent??null};})(),
        meshes:(()=>{const out=[],B=new (g.player.position.constructor)(),box=g.scene.children.length?null:null;void box;
          g.scene.traverse(o=>{if(!o.isMesh||!o.visible||/^Actor_|Camera|Viewmodel|FirstPerson/i.test(o.name+(o.parent?.name||'')))return;
            if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const bb=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
            if(o.isInstancedMesh)return;
            if(bb.min.x<at.x+0.9&&bb.max.x>at.x-0.9&&bb.min.z<at.z+0.9&&bb.max.z>at.z-0.9&&bb.max.y>at.y+0.1&&bb.min.y<at.y+1.3)
              out.push([o.name||o.parent?.name||'?',+bb.min.x.toFixed(2),+bb.min.y.toFixed(2),+bb.min.z.toFixed(2),+bb.max.x.toFixed(2),+bb.max.y.toFixed(2),+bb.max.z.toFixed(2)]);});
          return out.slice(0,24);})(),
        profile:(()=>{const t=window.routeBot?.points?.[window.routeBot.index];if(!t)return null;const out=[];
          for(let k=0;k<=8;k++){const x=at.x+(t.x-at.x)*k/8,z=at.z+(t.z-at.z)*k/8;out.push([+x.toFixed(2),+z.toFixed(2),+g.battlefield.GroundHeight(x,z).toFixed(2)]);}return out;})(),
        // Rapier's own view (09-24 step 3): every collider whose box overlaps the body's, what the controller hits
        // on a 5 cm step toward the target, and whether a knockdown / melee / emplacement holds the input.
        physics:(()=>{const P=g.physics,W=P.world,b=p.body,out={colliders:[],hits:[],hold:null,velocity:[+p.velocity.x.toFixed(2),+p.velocity.y.toFixed(2),+p.velocity.z.toFixed(2)],grounded:p.grounded};
          try{W.collidersWithAabbIntersectingAabb({x:at.x,y:at.y+.9,z:at.z},{x:.9,y:1.1,z:.9},c=>{if(c.handle===b?.collider?.handle)return true;const r=P.recordByHandle.get(c.handle),t=c.translation(),sh=c.shape;
            out.colliders.push({tag:r?.tag??null,id:r?.id??null,tile:r?.tile??null,type:sh?.type??null,group:c.collisionGroups?.(),sensor:c.isSensor?.(),t:[+t.x.toFixed(2),+t.y.toFixed(2),+t.z.toFixed(2)],he:sh?.halfExtents?[+sh.halfExtents.x.toFixed(2),+sh.halfExtents.y.toFixed(2),+sh.halfExtents.z.toFixed(2)]:null,r:sh?.radius??null,body:c.parent()?.bodyType?.()??null});return out.colliders.length<30;});}catch(e){out.collidersError=String(e);}
          const t=window.routeBot?.points?.[window.routeBot.index];
          if(t&&b?.collider){try{const cc=P.controller,d=Math.hypot(t.x-at.x,t.z-at.z)||1;cc.computeColliderMovement(b.collider,{x:(t.x-at.x)/d*.05,y:-.01,z:(t.z-at.z)/d*.05});const m=cc.computedMovement();out.test=[+m.x.toFixed(4),+m.y.toFixed(4),+m.z.toFixed(4)];
            for(let i=0;i<cc.numComputedCollisions();i++){const c=cc.computedCollision(i),r=P.recordByHandle.get(c.collider?.handle);out.hits.push({tag:r?.tag??null,id:r?.id??null,tile:r?.tile??null,n:[+c.normal1.x.toFixed(2),+c.normal1.y.toFixed(2),+c.normal1.z.toFixed(2)],w:[+c.witness1.x.toFixed(2),+c.witness1.y.toFixed(2),+c.witness1.z.toFixed(2)]});}}catch(e){out.testError=String(e);}}
          const mc=g.meleeCombat;out.hold={melee:!!mc?.Active,blocking:!!mc?.Blocking,fighter:mc?.Fighter?.(mc.Player?.())?.state??null,mounted:!!g.emplacement?.Mounted,carry:g.carry?.KindId??null,cutscene:g.state.cutscene??null,busy:!!p.Busy};
          return out;})(),
        fragments:(()=>{const out=[],m=new (g.player.position.constructor)();g.scene.traverse(o=>{if(!o.isInstancedMesh||!/Fragment|Debris|Rubble/i.test(o.name+(o.parent?.name||'')))return;
          const M=new (o.matrixWorld.constructor)();for(let i=0;i<o.count;i++){o.getMatrixAt(i,M);m.setFromMatrixPosition(M).applyMatrix4(o.matrixWorld);if(near(m.x,m.z,2.5))out.push([o.name,+m.x.toFixed(2),+m.y.toFixed(2),+m.z.toFixed(2)]);}});return out.slice(0,20);})()};
    }).catch(e=>({error:String(e)}));
    await fs.writeFile(path.join(output,"Data_FrontStuck.json"),JSON.stringify(stuck,null,2)).catch(()=>{});
    if(stuck.failure?.facts?.length)console.log("FRONT_MISSION_FAILED",JSON.stringify(stuck.failure));
    console.log("FRONT_STUCK",JSON.stringify(stuck).slice(0,3000));
    throw error;
  }
  async function DriveLegs(){
  let guardIds=null;
  if(checkpoint){
    // A checkpoint start: half a second of the first frames (the runtime's own checkpoint set-up: He to the gun,
    // Zhou onto his exit route) before the same entry probe a continuous run takes at this stage.
    await page.evaluate(()=>window.Tengxian.StepFrames(30,1/60,false));
    const entry=await EntryState(checkpoint,"checkpoint");
    guardIds=entry.guards.map(x=>x.id);
  }
  if(ctx.stageFrom<=3){
  await Route(Routes.support,"RightNestApproach",{stance:"crouch",fight:true,crawl:true,recoverAfterEvade:true});
  await WaitFact("rightNestCaptured",90,true);
  const sight=await page.evaluate(async()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),{FRONT_SORTIE:S}=await import('./Data_FirstLevelFrontRoute.mjs');
    return {player:r.BlocksSight(r.Point(S.seat,1.65),r.Point(S.gap,1.2)),gun:r.BlocksSight(r.Point(S.nest,1.45),r.Point(S.gap,1.2))};
  });
  assert.equal(sight.player,false,"player can observe the actual breach through the rendered world");
  assert.equal(sight.gun,false,"right gun has a physical firing lane onto the breach");
  const staging=await page.evaluate(async()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),T=await import('three');
    const {FRONT_SORTIE:S}=await import('./Data_FirstLevelFrontRoute.mjs');
    const {MISSION_LAYOUT:L}=await import('./Data_FirstLevelMissionLayout.mjs');
    const luo=r.companion.Handle('luo'),gun=r.scene.getObjectByName('Emplacement_MissionGun');
    const rest=L.blocks.find(b=>b.id==='RightNestFrontRest'),vertex=new T.Vector3();let supportedY=Infinity;
    gun.updateMatrixWorld(true);
    gun.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
        if(Math.abs(vertex.x-rest.x)<rest.w/2&&Math.abs(vertex.z-rest.z)<rest.d/2)supportedY=Math.min(supportedY,vertex.y);}
    });
    return {separation:Math.hypot(luo.position.x-g.player.position.x,luo.position.z-g.player.position.z),
      seatDistance:Math.hypot(luo.position.x-S.seat.x,luo.position.z-S.seat.z),
      gunSupportGap:supportedY-(rest.y+rest.h/2),luo:luo.position.toArray(),player:g.player.position.toArray()};
  });
  await fs.writeFile(path.join(output,'Data_FrontStaging.json'),JSON.stringify(staging,null,2));
  assert.ok(staging.separation>=1.5&&staging.seatDistance>=1.5,'Luo occupies his own firing post clear of the player');
  assert.ok(staging.gunSupportGap>=-.02&&staging.gunSupportGap<.04,'the visible gun rests on its actual parapet');
  if(ctx.options.probeFrontGun){
    // A bounder who ran into the nest at the capture leaves the player in a bayonet fight with the Dadao out: the HUD
    // shows no F prompt while the melee lasts (UpdateContextualActionPrompts). Put the rifle back and let the prompt for
    // the gun come up before pressing F, as a player does (09-24: FrontRifleF died at (23.4,−153.6), 4 runs in a row).
    const ready=await page.evaluate(()=>{
      const g=window.Tengxian;
      for(let f=0;f<240;f++){
        const q=g.interact.Query(g.player);
        if(!g.meleeCombat.Active&&q?.point?.tag==="FirstLevelMission"&&g.hud.actionPrompts.some(p=>p.label===q.label))return {frames:f,label:q.label};
        if(!g.meleeCombat.Active&&g.state.activeSlot==="melee")g.Debug.Key("Digit1");
        g.StepFrames(1,1/60,false);
      }
      return {frames:240,melee:g.meleeCombat.Active,slot:g.state.activeSlot,prompts:g.hud.actionPrompts.map(p=>p.label)};
    });
    console.log("GUN_PROMPT",JSON.stringify(ready));
    await Interact();
    const gun=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),gun=r.emplacement.Emplacement(r.gunId),before=gun.roundsFired;
      const mounted=g.emplacement.View()?.id;
      g.player.yaw=0;g.player.pitch=0;g.Debug.Mouse(0,true);g.StepFrames(35,1/60,false);g.Debug.Mouse(0,false);
      const after=gun.roundsFired;g.Debug.Key("KeyF",true);g.StepFrames(1,1/60,false);g.Debug.Key("KeyF",false);
      return {mounted,before,after,released:!g.emplacement.View(),alive:g.player.alive};
    });
    await fs.writeFile(path.join(output,"Data_CapturedGunInput.json"),JSON.stringify(gun,null,2));
    assert.equal(gun.mounted,"MissionGun");assert.ok(gun.after>gun.before&&gun.released&&gun.alive,"F, real burst and F release work at the captured gun");
  }
  await CaptureFocus("RightNestCaptured",S.gap);
  const first=await HoldNest({stage:"MachineGun"},240,"ReturnToNestAfterEvade");
  await Report03Damage(ctx);
  assert.ok(first.mission.guards.slice(0,2).some(g=>g.alive));
  assert.ok(first.mission.guards.slice(0,2).filter(g=>g.alive).every(g=>g.safe));
  assert.ok(first.mission.guards.slice(2).some(g=>g.alive&&!g.safe));
  // 契约 §2.6：04 开始时何有田已接枪、老周已离枪 10 m（走回集结处是 05 的条件，这时可能还在路上）。
  assert.ok(first.mission.facts.includes("leftGunHandover")&&first.mission.facts.includes("zhouLeftGun"));
  if(ctx.stageTo>3)await EntryState("MachineGun","continuous");
  guardIds=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().guards.map(g=>g.actor.id));
  await CaptureFocus("FirstBatchSafe",S.gap);
  // A cold start at 03 checks Luo's front commands here; a run from 01 checks them with the 02 speakers (CheckOpeningActing).
  if(ctx.stageFrom>1)await CheckFrontActing(ctx);
  if(ctx.stageTo===3)return;
  }
  if(ctx.stageFrom<=4){
  await ReturnToSeat("ReturnToNestAfterEvade");
  await HoldNest({fact:"tankPositionPressured"},120,"ReturnToNestAfterEvade");
  await Route(S.rearRoute,"RightNestShortRetreat",{stance:"crouch",fight:false});
  // rightRearReached needs the player at the junction (B.rearArrivalM) out of the gun's sight. Wait there like a
  // player: dodge a grenade, then walk back. 2026-09-24 step 3: a dodge during the wait carried the bot 13 m north to
  // (36.6,-130.7), it stood there for 180 s and 04 never ended.
  for(let round=0;round<9;round++){
    const wait=await page.evaluate(({x,z})=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      for(let f=0;f<20*60&&g.player.alive&&r.flow.stage.id!=="Tank";f++){
        const evading=window.MissionInputDriver.EvadeGrenade();
        // Anyone who walks up to the junction is answered like a player would (09-25 TankProbe: flank man A came
        // through the abandoned nest to the rear door, 1.1 m off, and bled the waiting bot out while it only watched).
        const close=evading?null:window.MissionInputDriver.Target?.(8);
        if(close)window.MissionInputDriver.Shoot(close);
        else if(!evading){g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);}
        if(g.player.bleeding&&g.player.health<80)g.Debug.Key("KeyB");
        g.StepFrames(1,1/60,false);
        if(!evading&&Math.hypot(g.player.position.x-x,g.player.position.z-z)>2.5)break;
      }
      g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);if(g.state.activeSlot!=="primary")g.Debug.Key("Digit1");
      const p=g.player.position;
      return {stage:r.flow.stage.id,alive:g.player.alive,d:Math.hypot(p.x-x,p.z-z),at:[+p.x.toFixed(2),+p.z.toFixed(2)]};
    },S.rear);
    if(wait.stage==="Tank"||!wait.alive)break;
    if(wait.d>2.5){
      console.log("RIGHT_REAR_REJOIN",JSON.stringify(wait));
      // Back the way the dodge went: along the ammo-house trench (S.route starts at the junction), from its nearest corner.
      const near=S.route.reduce((best,q,i)=>Math.hypot(q.x-wait.at[0],q.z-wait.at[1])<Math.hypot(S.route[best].x-wait.at[0],S.route[best].z-wait.at[1])?i:best,0);
      await Route(S.route.slice(0,near+1).reverse(),"RightRearRejoin",{stance:"crouch",fight:false,arrivalM:Math.min(1,B.rearArrivalM)});
    }
  }
  await WaitStage("Tank",180);
  assert.deepEqual(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().guards.map(g=>g.actor.id)),guardIds,"04 retains both existing guard batches");
  await EntryState("Tank","continuous");
  }
  await CaptureFocus("RightRearJunction",S.attackRoute[1]);
  await Route([...Routes.bundle,{x:A.bundle.x,z:A.bundle.z+1}],"AmmoHouseCoveredBranch",{stance:"crouch",fight:true,crawl:true});
  await Interact();
  let state=await State();assert.ok(state.facts.includes("bundleTaken"));assert.ok(state.facts.includes("bundleRouteTraversed"));
  await CaptureFocus("AmmoHouse",A.bundle);
  await Route(Routes.bundleReturn,"SameBranchReturn",{stance:"crouch",fight:true,crawl:true});
  await WaitFact("bundleReturned",90,true);
  // --bomb-first (contract v1.1 deadlock ②, a non-ideal order the ideal drive never hits): stop on the attack branch
  // one bend (about 5 m) short of the attack position and finish the tank from there. attackPositionReached must then
  // be recorded as skipped and 05 must go on to the withdrawal like the ideal order.
  // ParseCampaignArgs reads the flag; the argv fallback keeps probes that build their own options working.
  const bombFirst=!!ctx.options.bombFirst||process.argv.includes("--bomb-first");
  const throwFrom=bombFirst?S.attackRoute.findIndex(p=>Math.hypot(p.x-S.throw.x,p.z-S.throw.z)<6)+1:S.attackRoute.length;
  assert.ok(throwFrom>1&&throwFrom<S.attackRoute.length+(bombFirst?0:1),"the attack branch has a throwing point short of the attack position");
  await Route(S.attackRoute.slice(0,throwFrom),"RoadsideAttackBranch",{stance:"crouch",fight:true,crawl:true});
  // Bomb-first: that corner is 5.9 m short, beyond a bundle's reach of the tank at Block (both throws of run L4 fell
  // 4.4 m short, tank intact, no Luo finish without a cut track). Creep on toward the attack position and stop just
  // outside its radius (B.attackArrivalM), where the fact still cannot be recorded.
  if(bombFirst)await Route([S.throw],"BombFirstCreep",{stance:"crouch",fight:true,crawl:true,arrivalM:B.attackArrivalM+.6});
  if(!bombFirst)await WaitFact("attackPositionReached",60,true);
  else{
    const short=await page.evaluate(({x,z})=>{const g=window.Tengxian,p=g.player.position;
      return {d:Math.hypot(p.x-x,p.z-z),facts:g.Debug.FirstLevelMission().facts};},S.throw);
    console.log("BOMB_FIRST_POSITION",JSON.stringify({fromThrowM:+short.d.toFixed(2)}));
    assert.ok(short.d>3&&!short.facts.includes("attackPositionReached"),`bomb-first throws from off the attack position (${short.d.toFixed(1)} m)`);
  }
  // 两段毁伤（战车大脑）：第一颗越过车顶扔到远侧履带边（断履带 MobilityKill，车体挡弹片），炮塔机枪照样打，
  // 要再补一颗才彻底哑火。旧路径（没有大脑）一颗同帧两样全记，break 条件与原来一致。
  // 战车探针（ctx.options.tankProbe）：断履带以后在攻击位上蹲 ≥ 8 s，记下车在 MobilityKill 里有没有朝投掷者开火；
  // 第二颗扔上车顶后甲板（aim "deck"），验发动机舱那一路。
  // "auto" (Script_FirstLevelBundleThrowDriver): the near track's far end when it is ≥ 7.5 m away (the tank holds Block
  // through 05, 7.8–8.9 m from the attack position), else over the hull to the far track.
  const aims=ctx.options.tankProbe?["auto","deck"]:["auto","auto"];
  for(let attempt=0;attempt<aims.length;attempt++){
    if(attempt>0&&ctx.options.tankProbe){
      const hold=await page.evaluate(()=>{
        const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),tr=r.tankRuntime,start=r.time;
        const shots0=tr?.log.shots.length??0,bursts0=tr?.brain?.telemetry.bursts.length??0;
        if(g.player.stance==="stand")g.Debug.Key("KeyC");
        for(let f=0;f<9*60&&g.player.alive&&r.tank.damageState==="MobilityKill";f++){
          if(g.player.bleeding&&g.player.health<80)g.Debug.Key("KeyB");
          // A tank escort walking up during the hold is answered like a player would (09-24 TankProbe run R: escort C
          // shot and bayoneted the crouched thrower from 1.8 m while the hold only watched the tank).
          const close=window.MissionInputDriver?.Target?.(8);
          if(close)window.MissionInputDriver.Shoot(close);else{g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);}
          g.StepFrames(1,1/60,false);
        }
        g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
        const bursts=(tr?.brain?.telemetry.bursts||[]).slice(bursts0),shots=(tr?.log.shots||[]).slice(shots0);
        return {heldS:r.time-start,state:r.tank.damageState,alive:g.player.alive,health:g.player.health,shots,
          bursts,atPlayer:bursts.filter(b=>b.target==="player"||b.target==="thrower").length+shots.filter(s=>s.target==="player").length};
      });
      await fs.writeFile(path.join(output,"Data_MobilityKillHold.json"),JSON.stringify(hold,null,2));
      console.log("MOBILITY_KILL_HOLD",JSON.stringify({heldS:hold.heldS,state:hold.state,health:hold.health,atPlayer:hold.atPlayer,bursts:hold.bursts.length,shots:hold.shots.length}));
      assert.ok(hold.alive,"player survives the MobilityKill hold");
    }
    // Nobody gets a free bayonet on a thrower busy aiming: deal with anyone inside 8 m first (at most 6 s).
    const cleared=await page.evaluate(()=>{const g=window.Tengxian,D=window.MissionInputDriver;let frames=0,close=null;
      for(;frames<360&&g.player.alive&&(close=D?.Target?.(8));frames++){D.Shoot(close);g.StepFrames(1,1/60,false);}
      g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);if(g.state.activeSlot!=="primary")g.Debug.Key("Digit1");
      return {frames,left:close?.missionId??null};});
    if(cleared.frames)console.log("BUNDLE_CLEAR_CLOSE",JSON.stringify(cleared));
    const thrown=await DriveBundleThrow(page,{aim:aims[attempt]});
    await fs.writeFile(path.join(output,`Data_BundleThrow${attempt}.json`),JSON.stringify(thrown,null,2));
    const t=thrown.mission.tank;
    console.log("BUNDLE_THROW",JSON.stringify({aim:thrown.aimKind,alive:thrown.alive,health:thrown.health,selfBlast:thrown.selfBlast,miss:thrown.blastMiss,
      state:t.damageState,immobilized:t.immobilized,fireDisabled:t.fireDisabled,x:t.x,z:t.z,land:thrown.land,brainBlasts:thrown.mission.tankBrain?.log?.blasts?.slice(-1)}));
    assert.ok(thrown.alive);
    // 集束弹不该炸到扔它的人（车体挡着）：基线瞄车中心是 0；这里给 10 的余量（同一段时间里的步兵擦伤不算在内）。
    if(t.brain)assert.ok(thrown.selfBlast<=10,`bundle ${aims[attempt]} must not blast the thrower (${thrown.selfBlast} HP)`);
    if(t.fireDisabled||(!t.brain&&t.immobilized))break;
  }
  state=await State();
  // 战车大脑取证（露面、每发主炮的预兆与落点、机枪、反应、毁伤序列、可破坏掩体）：证据目录，不断言。
  if(state.tankBrain)await fs.writeFile(path.join(output,"Data_TankBrain.json"),JSON.stringify(state.tankBrain,null,2));
  // Thrown from 5-6 m further back, both bundles can land short of the far track (09-24: 3.8 m, MobilityKill only);
  // with none left Luo pushes one into the hatch (TANK.luoFinishS). That is the game's own answer, not a driver shortcut.
  if(bombFirst&&!state.facts.includes("tankFireDisabled")){
    // Waiting for Luo in the open got the thrower bayoneted by a reserve (09-24 J chain): wait a bend back in the branch.
    await Route([S.attackRoute[Math.max(1,throwFrom-2)]],"BombFirstCover",{stance:"crouch",fight:true,crawl:true});
    state=await WaitFact("tankFireDisabled",90,true);
  }
  assert.ok(state.facts.includes("tankImmobilized"));assert.ok(state.facts.includes("tankFireDisabled"));
  // The tank brain's own damage record (contract §2 item 7: Intact → MobilityKill → Disabled). Every run: it only
  // ever moves forward and ends Disabled (an engine-deck hit may skip MobilityKill). Bomb-first: both stages, since
  // Luo only finishes a tank whose track is already cut.
  const damageLog=state.tankBrain?.brain?.damageLog;
  if(damageLog){
    const steps=[damageLog[0]?.from,...damageLog.map(e=>e.to)].join(">");
    console.log("TANK_DAMAGE_LOG",JSON.stringify({steps,log:damageLog}));
    assert.ok(["Intact>Disabled","Intact>MobilityKill>Disabled"].includes(steps),"tank damage goes forward to Disabled: "+steps);
    if(bombFirst)assert.equal(steps,"Intact>MobilityKill>Disabled","bomb-first records both damage stages");
  }
  if(bombFirst){
    // One runtime step lets UpdateSortie see the cleared tank; the beat must be closed as skipped, not waited for.
    const skip=await page.evaluate(()=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();g.StepFrames(2,1/60,false);
      return r.flow.log.find(e=>e.kind==="fact"&&e.id==="attackPositionReached")?.detail??null;});
    await fs.writeFile(path.join(output,"Data_BombFirst.json"),JSON.stringify(skip,null,2));
    console.log("BOMB_FIRST_SKIP",JSON.stringify(skip));
    assert.ok(skip?.skipped&&skip.reason==="tankClearedFirst"&&!skip.playerAtThrow,"bomb-first: attackPositionReached recorded as skipped");
  }
  await CaptureFocus("TankDisabled",state.tank);
  // Back along the branch from wherever the body is now (the bomb-first wait already stands a bend back).
  const retreat=[...S.attackRoute].reverse(),here=await page.evaluate(()=>({x:window.Tengxian.player.position.x,z:window.Tengxian.player.position.z}));
  const from=retreat.reduce((best,p,i)=>Math.hypot(p.x-here.x,p.z-here.z)<Math.hypot(retreat[best].x-here.x,retreat[best].z-here.z)?i:best,0);
  await Route(retreat.slice(from),"AttackBranchRetreat",{stance:"crouch",fight:true,crawl:true});
  // Contract §2.6 (Front package step 2): the last batch crosses while the pair walks back. Like Luo, cover the
  // gap from the nest's west door (K10) until the batch is home, then go down the right low trench to the safe zone
  // (FRONT_SPACE.returnMeet: Liu, He and the relief NCO), and on to the collection.
  const back=MISSION_STAGE_ROUTES.collectionReturn,door=back.findIndex(p=>Math.hypot(p.x-Space.westDoor.x,p.z-Space.westDoor.z)<.5);
  assert.ok(door>0,"the collection return passes the nest's west door");
  // Walk through the compound to the west door without stopping to trade shots (the watch itself fights below).
  // The 09-24 stalls at (29.9,-143.8) on this leg were the capsule resting on the north edge of crater tile 3,-19
  // and never counting as grounded (fall speed -44 m/s pushed it back down the ramp); fixed in Script_Physics
  // (TERRAIN_TILE_EDGE_SNAP_M).
  await Route(back.slice(0,door+1),"WestDoorGapWatch",{stance:"crouch",fight:false,crawl:true});
  await CaptureFocus("BreachReopened",S.gap);
  await WaitFact("lastGuardsWithdrawn",240,true);
  const meet=back.findIndex(p=>p.x===S.approach[2].x&&p.z===S.approach[2].z);
  assert.ok(meet>door,"the collection return passes the safe zone");
  await Route([...back.slice(door,meet),Space.returnMeet],"SafeZoneMeeting",{stance:"crouch",fight:false});
  await WaitFact("frontDisengaged",90);
  await WaitFact("returnMet",60);
  await Route([Space.returnMeet,...back.slice(meet)],"OriginalCollectionPoint",{stance:"crouch",fight:false});
  const end=await WaitStage("Orders",180);
  for(const fact of ["attackRetreated","reliefInPosition","collectionReturned"])assert.ok(end.mission.facts.includes(fact));
  assert.ok(end.mission.guards.filter(g=>g.alive).every(g=>g.safe));
  await fs.writeFile(path.join(output,"Data_FrontTopologyContinuous.json"),JSON.stringify({guardIds,state:end.mission},null,2));
  }
}
