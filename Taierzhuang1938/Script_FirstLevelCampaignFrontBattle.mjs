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
  await Route(Routes.support,"RightNestApproach",{stance:"crouch",fight:true,crawl:true});
  await WaitFact("rightNestCaptured",90,true);
  const sight=await page.evaluate(async()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),{FRONT_SORTIE:S}=await import('./Data_FirstLevelFrontRoute.mjs');
    return {player:r.BlocksSight(r.Point(S.seat,1.65),r.Point(S.gap,1.2)),gun:r.BlocksSight(r.Point(S.nest,1.45),r.Point(S.gap,1.2))};
  });
  assert.equal(sight.player,false,"player can observe the actual breach through the rendered world");
  assert.equal(sight.gun,false,"right gun has a physical firing lane onto the breach");
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
  await CaptureFocus("RightNestCaptured",S.nest);
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
  for(let attempt=0;attempt<2;attempt++){
    const thrown=await DriveBundleThrow(page);
    await fs.writeFile(path.join(output,`Data_BundleThrow${attempt}.json`),JSON.stringify(thrown,null,2));
    console.log("BUNDLE_THROW",JSON.stringify({alive:thrown.alive,miss:thrown.blastMiss,tank:thrown.mission.tank}));
    assert.ok(thrown.alive);
    if(thrown.mission.tank.immobilized)break;
  }
  state=await State();assert.ok(state.facts.includes("tankImmobilized"));assert.ok(state.facts.includes("tankFireDisabled"));
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
