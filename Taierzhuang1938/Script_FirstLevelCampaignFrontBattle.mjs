// Continuous 03–05 input driver; --stage-from=3 initializes once, never jumps between stages.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";
import { DriveBundleThrow } from "./Script_FirstLevelBundleThrowDriver.mjs";

export async function DriveFrontBattle(ctx){
  const {page,output}=ctx,{Route,Interact,WaitStage,CaptureFocus}=CampaignActions(ctx);
  async function State(){return page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());}
  async function WaitFact(fact,seconds=120,fight=false){
    let state;
    for(let i=0;i<seconds;i+=5){
      state=await page.evaluate(({fact,fight})=>{
        const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
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
  assert.equal((await State()).stage,"Support");
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
  const first=await WaitStage("MachineGun",240,{fight:true});
  assert.ok(first.mission.guards.slice(0,2).some(g=>g.alive));
  assert.ok(first.mission.guards.slice(0,2).filter(g=>g.alive).every(g=>g.safe));
  assert.ok(first.mission.guards.slice(2).some(g=>g.alive&&!g.safe));
  assert.ok(first.mission.facts.includes("zhouGunWounded"));
  const guardIds=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().guards.map(g=>g.actor.id));
  await CaptureFocus("FirstBatchSafe",S.gap);
  if(ctx.stageTo===3)return;
  await WaitFact("tankPositionPressured",120,true);
  await Route(S.rearRoute,"RightNestShortRetreat",{stance:"crouch",fight:false});
  await WaitStage("Tank",180);
  assert.deepEqual(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().guards.map(g=>g.actor.id)),guardIds,"04 retains both existing guard batches");
  await CaptureFocus("RightRearJunction",S.attackRoute[1]);
  await Route([...Routes.bundle,{x:A.bundle.x,z:A.bundle.z+1}],"AmmoHouseCoveredBranch",{stance:"crouch",fight:true,crawl:true});
  await Interact();
  let state=await State();assert.ok(state.facts.includes("bundleTaken"));assert.ok(state.facts.includes("bundleRouteTraversed"));
  await CaptureFocus("AmmoHouse",A.bundle);
  await Route(Routes.bundleReturn,"SameBranchReturn",{stance:"crouch",fight:true,crawl:true});
  await WaitFact("bundleReturned",90,true);
  await Route(S.attackRoute,"RoadsideAttackBranch",{stance:"crouch",fight:true,crawl:true});
  await WaitFact("attackPositionReached",60,true);
  // 两段毁伤（战车大脑）：第一颗断履带（MobilityKill，炮塔机枪照样打），要再补一颗才彻底哑火。
  // 旧路径（没有大脑）一颗同帧两样全记，break 条件与原来一致。
  for(let attempt=0;attempt<2;attempt++){
    const thrown=await DriveBundleThrow(page,{aim:"track"});
    await fs.writeFile(path.join(output,`Data_BundleThrow${attempt}.json`),JSON.stringify(thrown,null,2));
    const t=thrown.mission.tank;
    console.log("BUNDLE_THROW",JSON.stringify({alive:thrown.alive,miss:thrown.blastMiss,state:t.damageState,immobilized:t.immobilized,fireDisabled:t.fireDisabled,
      x:t.x,z:t.z,brainBlasts:thrown.mission.tankBrain?.log?.blasts?.slice(-1)}));
    assert.ok(thrown.alive);
    if(t.fireDisabled||(!t.brain&&t.immobilized))break;
  }
  state=await State();
  // 战车大脑取证（露面、每发主炮的预兆与落点、机枪、反应、毁伤序列、可破坏掩体）：证据目录，不断言。
  if(state.tankBrain)await fs.writeFile(path.join(output,"Data_TankBrain.json"),JSON.stringify(state.tankBrain,null,2));
  assert.ok(state.facts.includes("tankImmobilized"));assert.ok(state.facts.includes("tankFireDisabled"));
  await CaptureFocus("TankDisabled",state.tank);
  await Route([...S.attackRoute].reverse(),"AttackBranchRetreat",{stance:"crouch",fight:true,crawl:true});
  await WaitFact("lastGuardsWithdrawn",240,true);
  await Route(MISSION_STAGE_ROUTES.collectionReturn.slice(0,5),"LeaveFrontThroughRearTrench",{stance:"crouch",fight:false});
  await WaitFact("frontDisengaged",90);
  await Route(MISSION_STAGE_ROUTES.collectionReturn.slice(5),"OriginalCollectionPoint",{stance:"crouch",fight:false});
  const end=await WaitStage("Orders",180);
  for(const fact of ["attackRetreated","reliefInPosition","collectionReturned"])assert.ok(end.mission.facts.includes(fact));
  assert.ok(end.mission.guards.filter(g=>g.alive).every(g=>g.safe));
  await fs.writeFile(path.join(output,"Data_FrontTopologyContinuous.json"),JSON.stringify({guardIds,state:end.mission},null,2));
}
