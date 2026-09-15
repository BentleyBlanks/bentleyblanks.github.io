import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
// Real browser baseline and campaign input driver; screenshots stay local.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { PlayFirstLevelOpening } from "./Script_FirstLevelOpeningBrowserTest.mjs";
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { MISSION_ENCOUNTERS, MISSION_TRANSFER_BEATS, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { SCENE_RENDER_LIMITS } from "./Data_AssetStandards.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, "..");
const audioCheck = process.argv.includes("--audio");
const stageJumps = process.argv.includes("--stage-jumps");
const allowCheckpointRetry=process.argv.includes("--allow-checkpoint-retry");
const campaignRetries=[];
const sortieFixture=process.argv.includes("--sortie-fixture");
const stageFrom = sortieFixture?5:Number(process.argv.find(arg=>arg.startsWith("--stage-from="))?.split("=")[1] || 1);
assert.ok(stageFrom===1 || sortieFixture || (stageJumps && [8,12,16].includes(stageFrom)),"supported continuation suites start at 1, 8, 12 or 16");
const output = path.join(here, "_shots", sortieFixture?"FirstLevelSortieFixture":stageFrom===8 ? "FirstLevelStageVillage" : stageFrom===12 ? "FirstLevelStageTransfer" : stageFrom===16 ? "FirstLevelStageTail" : stageJumps ? "FirstLevelStageContinue" : "FirstLevelMission");
const jumpReceipts = [];
async function JumpStage(number) {
  if (!stageJumps) return;
  const receipt = await page.evaluate(async number => {
    const g=window.Tengxian, before=g.Debug.FirstLevelMission();
    const after=await g.Debug.FirstLevelJump(number);
    // Test driver memory belongs to the old actors, just like the old runtime.
    if(window.MissionInputDriver){window.MissionInputDriver.blocked.clear();window.MissionInputDriver.lastTarget=null;window.MissionInputDriver.observedShot=0;}
    if(number===7)window.villageBodies=g.ai.soldiers.filter(a=>["VillageGunner","VillageCorner","KitchenGuard","RearWindow","SideYard","AmbushLead","AmbushRearA","AmbushRearB","AmbushFlank"].includes(a.missionId)).map(a=>({id:a.id,missionId:a.missionId}));
    return {number,before:before.stage,beforePhase:before.phaseNumber,after:after.stage,phase:after.phaseNumber,remaining:after.remaining};
  },number);
  assert.equal(receipt.phase,number);assert.ok(receipt.remaining.length);
  if(number>stageFrom)assert.equal(receipt.beforePhase,number,"previous debug start reaches the next public phase before restarting it");
  jumpReceipts.push(receipt);console.log("STAGE_JUMP",JSON.stringify(receipt));
}
const capturedActivities = new Set();
await fs.mkdir(output, { recursive: true });
const server = await ServeRoot(root, 0),
  browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }),
  errors = [];
page.on("pageerror", (error) => {
  errors.push(String(error));
  console.log("PAGEERROR", String(error));
});
async function Capture(name) {
  await page.evaluate(() => window.Tengxian.StepFrames(6, 1 / 60, true));
  const render = await page.evaluate(() => {
    const g = window.Tengxian,
      info = g.renderer.info,
      reset = info.autoReset;
    info.autoReset = false;
    info.reset();
    g.StepFrames(1, 1 / 60, true);
    const result = { drawCalls: info.render.calls, triangles: info.render.triangles };
    // 预算读数旁边带上「谁在花」：活人 / 尸体 / LOD 分布、蒙皮数，以及按场景根节点拆的三角形。
    // 超预算时光看一个总数定不了责任，A/B 两棵树各跑一遍就能看出是布景、人物还是尸体在涨。
    const soldiers = g.ai ? g.ai.soldiers : [];
    const lod = {};
    for (const s of soldiers) { const k = (s.alive ? "" : "dead:") + (s.renderLod || "none"); lod[k] = (lod[k] || 0) + 1; }
    let skinned = 0, meshes = 0;
    g.scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; if (o.isMesh && o.visible) meshes++; });
    result.actors = { total: soldiers.length, alive: soldiers.filter((s) => s.alive).length,
      ija: soldiers.filter((s) => s.alive && s.side === "ija").length, nra: soldiers.filter((s) => s.alive && s.side === "nra").length, lod, skinned, meshes };
    result.roots = g.scene.children.map((c) => { let tris = 0, m = 0; c.traverse((o) => { if (o.isMesh && o.visible) { m++; const geo = o.geometry; const n = (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); } }); return { name: c.name || c.type, m, tris: Math.round(tris) }; }).filter((r) => r.tris > 20000).sort((a, b) => b.tris - a.tris).slice(0, 14);
    info.autoReset = reset;
    return result;
  });
  console.log("BUDGET", name, JSON.stringify(render));
  if(name==="MachineGun") {
    const timing=await page.evaluate(async()=>{
      const {Box3,Vector3}=await import("three");
      const g=window.Tengxian,gl=g.renderer.getContext(),samples=[];
      for(let i=0;i<24;i++){const start=performance.now();g.StepFrames(1,1/60,true);gl.finish();if(i>=4)samples.push(performance.now()-start);}
      samples.sort((a,b)=>a-b);
      const reducedBounds=Object.fromEntries([...g.ai.crowd.kinds].map(([key,entry])=>{
        const bounds=new Box3();for(const mesh of entry.meshes){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox);}
        return [key,bounds.getSize(new Vector3()).toArray()];
      }));
      return {method:"synchronous simulation and GPU completion, 4 warmup and 20 measured frames",p50Ms:samples[10],p95Ms:samples[19],reducedBounds,
        actualLivingEnemies:g.ai.soldiers.filter(actor=>actor.alive && actor.side==="ija").length,
        front:g.Debug.FirstLevelMission().assault,crowd:g.ai.crowd?.BakeReport(),cellM:g.ai.crowd?.cellM};
    });
    await fs.writeFile(path.join(output,"Data_FrontFrameTiming.json"),JSON.stringify(timing,null,2));
    const standing=Object.entries(timing.crowd).filter(([key])=>key.endsWith(":standing"));
    assert.ok(timing.cellM>0 && standing.length>=2 && standing.every(([,entry])=>entry.bodySpan>1.2),"the optimized standing crowd retains human-sized bodies");
    for(const [key,entry] of Object.entries(timing.crowd))assert.ok(entry.size.every((size,axis)=>Math.abs(size-timing.reducedBounds[key][axis])<=2*Math.sqrt(3)*timing.cellM),"clustering preserves the original pose bounds: "+key);
  }
  assert.ok(
    render.drawCalls <= SCENE_RENDER_LIMITS.drawCalls && render.triangles <= SCENE_RENDER_LIMITS.triangles,
    `${name} must fit the shared whole-frame rendering budget: ${JSON.stringify(render)}`,
  );
  await page.screenshot({ path: path.join(output, `Scene_${name}.png`) });
  await fs.writeFile(
    path.join(output, `Data_${name}.json`),
    JSON.stringify(
      await page.evaluate(() => ({
        mission: window.Tengxian.Debug.FirstLevelMission(),
        position: { ...window.Tengxian.player.position },
        health: window.Tengxian.player.health,
        medical:{bleeding:window.Tengxian.player.bleeding,bandages:window.Tengxian.player.bandages,
          regenTo:window.Tengxian.player.bandageRegenTo},
        damage:window.missionDamage?.slice(-12),
        cast: window.Tengxian.ai.soldiers
          .filter((a) => a.castId)
          .map((a) => ({
            id: a.castId,
            position: { ...a.position },
            goal: { ...a.goal },
            stance: a.stance,
            unloaded: a.missionUnloaded,
            exitIndex: a.missionExitIndex,
            speedMps:a.moveSpeed*3.6,scriptSpeedMps:a.scriptMoveSpeedMps,yaw:a.yaw,
            march:a.squadMarchCommand,targetVisible:a.targetVisible,
            route:window.Tengxian.Debug.FirstLevelMissionRuntime().squadRoutes.get(a.id)?.slice(0,3),
          })),
      })),
      null,
      2,
    ),
  );
}
async function CaptureFocus(name,point) {
  const view=await page.evaluate(point=>{
    const g=window.Tengxian,p=g.player.position,eye=g.player.EyePosition;
    const previous={yaw:g.player.yaw,pitch:g.player.pitch};
    g.player.yaw=Math.atan2(p.x-point.x,p.z-point.z);
    g.player.pitch=Math.atan2(g.battlefield.GroundHeight(point.x,point.z)+(point.height||1.2)-eye.y,Math.hypot(p.x-point.x,p.z-point.z));
    return previous;
  },point);
  await Capture(name);
  await page.evaluate(view=>Object.assign(window.Tengxian.player,view),view);
}
// How many checkpoint retries one leg may spend before the route is called
// unwalkable. Two covers an unlucky firefight; a leg that needs more is telling
// you the level got harder, not that the dice went badly.
const ROUTE_RETRY_BUDGET = 2;

/**
 * 等一场关中过场播完（不按 Esc：这条测试要的就是「玩家坐着看完」的时序）。
 * Route 的内循环自己会等；这一只给循环之外的按键动作用（上机枪、补弹、交互）。
 */
async function WaitOutCutscene(label) {
  if (!(await page.evaluate(() => !!window.Tengxian.state.cutscene))) return false;
  const id = await page.evaluate(() => window.Tengxian.state.cutscene);
  console.log("CUTSCENE_WAIT", label, id);
  for (let i = 0; i < 60; i += 1) {
    await page.evaluate(() => {
      const g = window.Tengxian;
      g.Debug.Key("KeyW", false); g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
      g.StepFrames(120, 1 / 60, false);
    });
    if (!(await page.evaluate(() => !!window.Tengxian.state.cutscene))) {
      console.log("CUTSCENE_DONE", label, id);
      return true;
    }
  }
  throw new Error(`关中过场 ${id} 在 ${label} 处两分钟都没播完`);
}

async function Route(points, label, { fight = false, stance = "stand", sprint = false, crawl = false, rejoinRoute = null } = {}) {
  const rejoinTarget=points.at(-1);
  await page.evaluate(
    async ({ points, stance, sprint, rejoinRoute, rejoinTarget }) => {
      const g = window.Tengxian;
      if(rejoinRoute){
        const {MissionRouteBetween}=await import("./Script_FirstLevelMissionColumn.mjs");
        points=MissionRouteBetween(rejoinRoute,g.player.position,rejoinTarget);
      }
      window.routeBot = { points, index: 0, frames: 0, stalled: 0, last: { ...g.player.position } };
      if (g.player.stance !== stance)
        g.Debug.Key(
          stance === "crouch"
            ? "KeyC"
            : stance === "prone"
              ? "KeyZ"
              : g.player.stance === "crouch"
                ? "KeyC"
                : "KeyZ",
        );
      g.Debug.Key("ShiftLeft", sprint);
    },
    { points, stance, sprint, rejoinRoute, rejoinTarget },
  );
  const carriedKind=await page.evaluate(()=>window.Tengxian.carry.KindId);
  let result, retries = 0;
  for (let chunk = 0; chunk < 90; chunk++) {
    result = await page.evaluate(async ({fight,stance,crawl,sprint}) => {
      const {FRONT_SORTIE}=await import("./Data_FirstLevelFrontRoute.mjs");
      const g = window.Tengxian,
        b = window.routeBot,
        Wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
      for (let i = 0; i < 600 && b.index < b.points.length && g.player.alive && g.state.running; i++) {
        const p = g.player.position,
          target = b.points[b.index];
        if (Math.hypot(p.x - target.x, p.z - target.z) < 0.8) {
          b.index++;
          continue;
        }
        // 关中过场（04 机枪点位那一场）：玩家这时候没有控制权，什么键都递不进去。
        // 像玩家一样等它播完 —— 松手、照常推帧、这一段不算进停滞计数
        // （44 s 不动的话，下面那条「三个 chunk 没挪窝就算走不通」会把整条路判死）。
        if (g.state.cutscene) {
          g.Debug.Key("KeyW", false);
          g.Debug.Mouse(0, false);
          g.Debug.Mouse(2, false);
          b.cutsceneFrames = (b.cutsceneFrames || 0) + 1;
          b.cutscenes = b.cutscenes || {};
          b.cutscenes[g.state.cutscene] = (b.cutscenes[g.state.cutscene] || 0) + 1;
          g.StepFrames(1, 1 / 60, false);
          b.frames++;
          continue;
        }
        const evading=crawl&&fight&&window.MissionInputDriver.EvadeGrenade();
        const foe = fight&&!evading ? window.MissionInputDriver.Target(crawl?28:90) : null;
        if(crawl&&!evading){
          const low=FRONT_SORTIE.crawl.some(c=>Math.abs(p.x-c.x)<c.w/2+1 && Math.abs(p.z-c.z)<c.d/2+3);
          const desired=low?"prone":stance;
          if(g.player.stance!==desired)g.Debug.Key(desired==="prone"?"KeyZ":desired==="crouch"?"KeyC":g.player.stance==="prone"?"KeyZ":"KeyC");
          g.Debug.Key("ShiftLeft",sprint&&!low&&!foe);
        }
        if(evading){g.StepFrames(1,1/60,false);b.frames++;continue;}
        if (foe) {
          g.Debug.Key("KeyW", false);
          window.MissionInputDriver.Shoot(foe);
        } else {
          g.Debug.Mouse(0, false);
          g.Debug.Mouse(2, false);
          const yaw = Math.atan2(p.x - target.x, p.z - target.z);
          const gap = Wrap(yaw - g.player.yaw);
          g.Debug.Key("KeyW", Math.abs(gap) < 0.65);
          g.player.yaw += Math.max(-0.04, Math.min(0.04, gap));
          g.player.pitch = 0;
        }
        if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
        g.StepFrames(1, 1 / 60, false);
        b.frames++;
      }
      g.Debug.Key("KeyW", false);
      g.Debug.Mouse(0, false);
      g.Debug.Mouse(2, false);
      const chunkCutscene = b.cutsceneFrames || 0;
      b.cutsceneFrames = 0;
      b.stalled = chunkCutscene > 0 ? 0
        : (Math.hypot(g.player.position.x - b.last.x, g.player.position.z - b.last.z) < 0.2 ? b.stalled + 1 : 0);
      b.last = { ...g.player.position };
      return {
        done:
          b.index === b.points.length ||
          (g.Debug.FirstLevelMissionRuntime().flow.completed &&
            Math.hypot(g.player.position.x - b.points.at(-1).x, g.player.position.z - b.points.at(-1).z) < 5),
        index: b.index,
        target: b.points[b.index],
        position: { ...g.player.position },
        alive: g.player.alive,
        health: g.player.health,
        medical:{bleeding:g.player.bleeding,bandages:g.player.bandages,regenTo:g.player.bandageRegenTo},
        stage: g.Debug.FirstLevelMissionRuntime().flow.stage.id,
        stalled: b.stalled,
        cutscene: g.state.cutscene,
        cutsceneFrames: chunkCutscene,
        cutscenesSeen: b.cutscenes || null,
        shots: g.state.playerShots,
        ammo: g.state.ammo,
        clips: g.state.clips,
        activeSlot:g.state.activeSlot,primaryMagazine:{...g.state.mags.primary},
        lastShot: g.state.lastShot,
        foe: window.MissionInputDriver?.Target()?.missionId,
      };
    }, {fight,stance,crawl,sprint});
    if (chunk % 4 === 0 || result.done || !result.alive) console.log(label, JSON.stringify(result));
    // A death can also leave the body stationary. Let the existing checkpoint
    // retry below handle it before applying the live-navigation stall limit.
    if (result.done || (result.alive && result.stalled >= 3)) break;
    if (!result.alive) {
      // Losing a firefight is an outcome of live combat, not a regression: this
      // bot fights standing in the open with no cover, and the runs that died
      // died at a different waypoint each time while other runs walked the whole
      // level. Recover the way a player does — the shipped checkpoint retry,
      // which restores the player without granting facts, spending supplies or
      // moving what he carries — and hold the route to "completable" rather than
      // "never loses a fight". Drift in difficulty still surfaces here, as a
      // route that burns its retry budget instead of one unlucky death.
      if (++retries > ROUTE_RETRY_BUDGET) break;
      console.log(label, `player died at waypoint ${result.index}; checkpoint retry ${retries}/${ROUTE_RETRY_BUDGET}`);
      const retry=await page.evaluate(async ({ stance, sprint, rejoinRoute, rejoinTarget }) => {
        const g = window.Tengxian;
        const Snapshot=()=>{const r=g.Debug.FirstLevelMissionRuntime();return {
          stage:r.flow.stage.id,time:r.time,position:g.player.position.toArray(),facts:[...r.flow.facts],
          enemies:[...r.enemies.values()].map(a=>({id:a.id,alive:a.alive}))};};
        const before=Snapshot();
        g.Debug.MenuAct("continueCheckpoint");
        const after=Snapshot();
        g.StepFrames(1, 1 / 60, false);
        // Re-establish the stance and sprint the leg asked for, and re-seed the
        // stall detector: the retry teleports the body to the checkpoint.
        if (g.player.stance !== stance)
          g.Debug.Key(stance === "crouch" ? "KeyC" : stance === "prone" ? "KeyZ"
            : g.player.stance === "crouch" ? "KeyC" : "KeyZ");
        g.Debug.Key("ShiftLeft", sprint);
        const b = window.routeBot;
        // Stage progression may save a newer checkpoint. Join the authored
        // polyline from the actual spawn; never replay a stale house entry.
        if(rejoinRoute){
          const {MissionRouteBetween}=await import("./Script_FirstLevelMissionColumn.mjs");
          b.points=MissionRouteBetween(rejoinRoute,g.player.position,rejoinTarget);
        }
        b.index = 0;
        b.stalled = 0; b.last = { ...g.player.position };
        return {before,after};
      }, { stance, sprint, rejoinRoute, rejoinTarget });
      assert.equal(retry.after.stage,retry.before.stage,'route retry retains the mission step');
      assert.deepEqual(retry.after.facts,retry.before.facts,'route retry retains every mission fact');
      assert.deepEqual(retry.after.enemies,retry.before.enemies,'route retry retains enemy casualties');
      campaignRetries.push({kind:'route',label,stage:retry.before.stage,time:retry.before.time,
        beforePosition:retry.before.position,afterPosition:retry.after.position,
        factsPreserved:true,casualtiesPreserved:true});
      // A player recovering at the depot can use its real crate before setting
      // out again. Do not grant supplies from the checkpoint or from the driver.
      const depot=await page.evaluate(()=>{
        const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
        return r.flow.stage.id==='Tank'&&g.player.bandages===0&&g.interact.Query(g.player)?.point?.id==='MissionBundle';
      });
      if(depot){await Interact();assert.equal(await page.evaluate(()=>window.Tengxian.player.bandages),R.bundleSupplyBandages,'depot retry physically replenishes dressings');}
      if(carriedKind==='stretcher' && await page.evaluate(()=>window.Tengxian.carry.KindId!=='stretcher')){
        // Death really drops the patient. Retry restores the player, so walk
        // back and use F before continuing; an empty-handed arrival is not a carry.
        const pickup=await page.evaluate(()=>{
          const z=window.Tengxian.Debug.FirstLevelMission().column.litters.find(l=>l.zhou);
          return {x:z.x+Math.sin(z.yaw)*1.6,z:z.z+Math.cos(z.yaw)*1.6};
        });
        await Route([pickup],label+'Repick',{fight:true,stance});
        await Interact();
        assert.equal(await page.evaluate(()=>window.Tengxian.carry.KindId),'stretcher','checkpoint retry reacquires the real patient through F');
        await page.evaluate(({points,sprint})=>{
          const g=window.Tengxian;
          window.routeBot={points,index:0,frames:0,stalled:0,last:{...g.player.position}};
          g.Debug.Key('ShiftLeft',sprint);
        },{points,sprint});
      }
    }
  }
  await page.evaluate(() => window.Tengxian.Debug.Key("ShiftLeft", false));
  await Capture(label);
  assert.ok(result.alive, `${label}: player alive (spent ${retries}/${ROUTE_RETRY_BUDGET} checkpoint retries)`);
  assert.ok(result.done, `${label}: actual body reached route end`);
  return result;
}
async function Interact() {
  // 交互键在过场期间递不进去（见 WaitOutCutscene）。
  await WaitOutCutscene("Interact");
  return page.evaluate(() => {
    const g = window.Tengxian,
      query = g.Debug.Interact();
    const interaction=g.interact.Query(g.player);
    if(interaction?.point?.tag==="FirstLevelMission"){
      g.StepFrames(1,1/60,true);
      const prompt=g.hud.actionPrompts.find(p=>p.label===interaction.label);
      if(!prompt||!document.querySelector(".actionText")?.textContent)throw Error("mission interaction needs a visible action label");
    }
    g.Debug.Key("KeyF", true);
    g.StepFrames(90, 1 / 60, false);
    g.Debug.Key("KeyF", false);
    return query;
  });
}
async function RetryCampaign({rewalk=true}={}) {
  if(!allowCheckpointRetry||stageJumps||campaignRetries.filter(retry=>retry.kind!=="route").length>=3)return false;
  const before=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    return {dead:!g.player.alive,stage:r.flow.stage.id,time:r.time,position:g.player.position.toArray(),facts:[...r.flow.facts],
      route:window.routeBot?.points||[],enemies:[...r.enemies.values()].map(a=>({id:a.id,alive:a.alive}))};
  });
  if(!before.dead)return false;
  await page.locator('.mnItem[data-act="continueCheckpoint"]').click();
  await page.waitForFunction(()=>window.Tengxian.player.alive&&window.Tengxian.state.running,null,{timeout:10000});
  const after=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    for(const key of ['KeyW','KeyS','KeyF','ShiftLeft'])g.Debug.Key(key,false);
    g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);window.MissionInputDriver.evading=false;
    return {stage:r.flow.stage.id,position:g.player.position.toArray(),facts:[...r.flow.facts],enemies:[...r.enemies.values()].map(a=>({id:a.id,alive:a.alive}))};
  });
  assert.equal(after.stage,before.stage,'normal retry retains the current mission step');
  assert.deepEqual(after.facts,before.facts,'normal retry neither grants nor erases mission facts');
  assert.deepEqual(after.enemies,before.enemies,'normal retry retains actual enemy casualties');
  campaignRetries.push({kind:"campaign",stage:before.stage,time:before.time,beforePosition:before.position,afterPosition:after.position,factsPreserved:true,casualtiesPreserved:true});
  console.log('NORMAL_CHECKPOINT_RETRY',JSON.stringify(campaignRetries.at(-1)));
  // Walk back through the last observed route using the ordinary movement driver.
  if(rewalk&&before.route.length)await Route(before.route,`CheckpointReturn${campaignRetries.length}`,{fight:true,stance:'crouch'});
  return true;
}
async function WaitStage(expected, seconds = 240, { fight = false, cover = false } = {}) {
  // Read only the step id in the per-frame loop. Full State clones the entire
  // casualty/transport ledger; keep that diagnostic snapshot at chunk boundaries.
  let state;
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk++) {
    state = await page.evaluate(
      ({ expected, fight, cover }) => {
        const g = window.Tengxian;
        for (let i = 0; i < 300 && g.player.alive && g.Debug.FirstLevelMissionRuntime().flow.stage.id !== expected; i++) {
          const evading=window.MissionInputDriver.EvadeGrenade();
          // At a waist-high defensive wall, use normal crouch/peek inputs.
          // Grenade evasion can leave the player standing outside its protection.
          if(cover&&!evading){
            const hide=g.state.ammo===0 || g.ai.time%5<3;
            if((g.player.stance==="crouch")!==hide)g.Debug.Key("KeyC");
          }
          const foe = fight&&!evading ? window.MissionInputDriver.Target(90) : null;
          if (foe) window.MissionInputDriver.Shoot(foe);
          else if(!evading) {
            g.Debug.Mouse(0, false);
            g.Debug.Mouse(2, false);
            if(g.state.activeSlot==="melee")g.Debug.Key("Digit1");
            if(g.state.ammo===0)g.Debug.Key("KeyR");
          }
          if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
          g.StepFrames(1, 1 / 60, false);
          if(g.Debug.FirstLevelMissionRuntime().flow.stage.id==="Rescue"&&!window.rescueWitnessCaptured &&
            ['yaowa','liuwencai'].every(id=>g.ai.soldiers.find(a=>a.castId===id)?.missionRescueReady))break;
        }
        g.Debug.Mouse(0, false);
        g.Debug.Mouse(2, false);
        return { mission: g.Debug.FirstLevelMission(), health: g.player.health, alive: g.player.alive };
      },
      { expected, fight, cover },
    );
    if(state.mission.stage==="Transfer" && state.mission.column.loaded>0 && !capturedActivities.has("TransferLoading")) {
      capturedActivities.add("TransferLoading");
      const cart=state.mission.column.vehicles.find(c=>!c.departed);
      await CaptureFocus("TransferLoading",cart);
      const collision=await page.evaluate(id=>{
        const g=window.Tengxian,box=g.battlefield.colliders.find(b=>b.id===id);
        const origin=g.player.position.clone().set(box.max[0]+.3,box.c[1],box.c[2]);
        const direction=origin.clone().set(-1,0,0),hit=g.battlefield.Raycast(origin,direction,8);
        return {id:hit?.box?.id,solid:g.physics.Overlaps(box.c[0],box.c[1],box.c[2],.2,.5)};
      },cart.id);
      assert.equal(collision.id,cart.id,"Moving transport remains a real bullet blocker at its current position");
      assert.ok(collision.solid,"The visible transport occupies the physical world");
    }
    if(state.mission.stage==="Death" && state.mission.control==="death" && !capturedActivities.has("ZhouDeath")) {
      capturedActivities.add("ZhouDeath");await Capture("ZhouDeath");
      const focus=await page.evaluate(()=>{
        const g=window.Tengxian,eye=g.player.EyePosition,z=g.Debug.FirstLevelMission().column.litters.find(l=>l.zhou);
        const desiredPitch=Math.atan2(g.battlefield.GroundHeight(z.x,z.z)+.44-eye.y,Math.hypot(z.x-eye.x,z.z-.7-eye.z));
        return {empty:g.Debug.FirstLevelMission().emptyHands,prompt:g.Debug.FirstLevelMission().openingPrompt,pitchError:Math.abs(g.player.pitch-desiredPitch)};
      });
      assert.ok(focus.empty&&focus.prompt===null&&focus.pitchError<.29,'death scene looks down at Zhou with the weapon put away');
    }
    if(state.mission.stage==="Rescue" && !capturedActivities.has("MedicalRescue") &&
      await page.evaluate(()=>['yaowa','liuwencai'].every(id=>window.Tengxian.ai.soldiers.find(a=>a.castId===id)?.missionRescueReady))) {
      await page.evaluate(()=>{window.rescueWitnessCaptured=true;});
      capturedActivities.add("MedicalRescue");await CaptureFocus("MedicalRescue",state.mission.column.litters.find(l=>l.zhou));
    }
    if(chunk%12===11)console.log("WAIT_PROGRESS",JSON.stringify({expected,stage:state.mission.stage,time:state.mission.time,health:state.health,remaining:state.mission.remaining}));
    if(!state.alive&&await RetryCampaign())continue;
    if (state.mission.stage === expected || !state.alive) break;
  }
  console.log(
    "wait",
    expected,
    JSON.stringify({
      stage: state.mission.stage,
      remaining: state.mission.remaining,
      health: state.health,
      column: state.mission.column.gatePassed,
    }),
  );
  await Capture(expected);
  assert.ok(state.alive);
  assert.equal(state.mission.stage, expected);
  return state;
}
try {
  await page.goto(
    `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&${audioCheck ? "menu=0" : "shot=1"}&manual=1&quality=low&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
  if(stageFrom===1) {
  await JumpStage(1);
  if (audioCheck) {
    await page.locator("#bootStart").click();
    await page.waitForFunction(()=>window.Tengxian.audio.ctx?.state==="running",null,{timeout:15000});
    const voices = await page.evaluate(async () => {
      const g = window.Tengxian,
        { MISSION_DIALOGUE } = await import("./Data_FirstLevelMissionDialogue.mjs");
      g.audio.Unlock();
      const cues = MISSION_DIALOGUE.map((cue) => {
        const played = g.audio.PlayStoryVoice(`Mission${cue.id}`);
        return {
          id: cue.id,
          decoded: !!g.audio.voiceBank.get(`Mission${cue.id}`),
          seconds: played?.duration || 0,
          started: !!played?.voice,
        };
      });
      g.audio.StopStoryVoice();
      return { context: g.audio.ctx?.state, cues };
    });
    assert.equal(voices.context, "running", "The real start button unlocks the audio context");
    assert.ok(
      voices.cues.every((c) => c.decoded && c.started && c.seconds > 0.5),
      "Every whole Seed Audio cue must decode and create a real playback source: " + JSON.stringify(voices),
    );
    console.log("ok every first-level voice asset decoded and played in the real audio engine");
    // Start unlocks asynchronously loaded ambience separately from mission voices.
    // Wait for the normal pack loader/restart path, without injecting test buffers.
    await page.waitForFunction(()=>window.Tengxian.audio.ambReady&&!window.Tengxian.audio.ambLoading,
      null,{timeout:60000});
    const carriageAudio=await page.evaluate(()=>{
      const a=window.Tengxian.audio;
      const beds=['trainCarriageOnly','carriageCrowd'].map(id=>{
        const buffer=a.ambBuffers.get(id),data=buffer?.getChannelData(0);
        let sum=0;for(const value of data||[])sum+=value*value;
        return {id,seconds:buffer?.duration||0,rms:data?Math.sqrt(sum/data.length):0,
          playing:a.ambLayers.some(layer=>layer.bed===id&&layer.heads.size>0)};
      });
      return {preset:a.ambiencePreset,beds,reaction:a.sampleCues.has('amb.carriageRearCheer')};
    });
    assert.equal(carriageAudio.preset,'firstLevelCarriage');
    assert.ok(carriageAudio.beds.every(bed=>bed.seconds>8&&bed.rms>.01&&bed.playing),
      'audible rolling train AND multiple-passenger bed must really decode and play: '+JSON.stringify(carriageAudio));
    assert.ok(carriageAudio.reaction,'the rear group response is loaded');
    await fs.writeFile(path.join(output,'Data_CarriageAudio.json'),JSON.stringify(carriageAudio,null,2));
  }
  await page.evaluate(()=>{const g=window.Tengxian,original=g.player.TakeHit.bind(g.player);window.missionDamage=[];
    g.player.TakeHit=(damage,part,direction,info)=>{const before=g.player.health,result=original(damage,part,direction,info);
      window.missionDamage.push({time:g.Debug.FirstLevelMission()?.time,before,after:g.player.health,damage,part,blast:!!info?.blast,bullet:!!info?.bullet,from:info?.from?.toArray(),position:g.player.position.toArray()});
      if(window.missionDamage.length>120)window.missionDamage.shift();return result;};});
  const initial = await page.evaluate(() => ({
    mission: window.Tengxian.Debug.FirstLevelMission(),
    position: { ...window.Tengxian.player.position },
    ammo: window.Tengxian.state.ammo,
    slots: { ...window.Tengxian.state.slots },
  }));
  assert.equal(initial.mission.stage, "Train");
  assert.equal(initial.mission.receivingFood,true,"the opening starts in the receiving position");
  assert.equal(initial.slots.primary, "HanYang");
  assert.equal(initial.slots.melee, "Dadao");
  console.log(
    "ok initial mission",
    JSON.stringify({ stage: initial.mission.stage, position: initial.position, slots: initial.slots }),
  );
  assert.deepEqual(initial.mission.train.counts, [12, 16, 12]);
  assert.equal(initial.mission.train.entries.length, 41, "40 recruits plus Luo, player separate");
  if(!process.argv.includes("--campaign"))await PlayFirstLevelOpening(page,{out:output,audioClock:audioCheck,mount:false});
  }
  campaignRun: if (process.argv.includes("--campaign")) {
    await page.evaluate(async () => {
      const {BLAST}=await import("./Data_Tuning_Combat.mjs");
      const g = window.Tengxian;
      window.MissionInputDriver = {
        blocked: new Map(),
        EvadeGrenade() {
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
          // Read the same live warning used by the HUD, then turn and sprint
          // through an open physical direction. Do not clear the projectile.
          const away=Math.atan2(p.position.x-threat.position.x,p.position.z-threat.position.z);
          let heading=null;
          for(const offset of [0,.55,-.55,1.1,-1.1,1.65,-1.65]){
            const angle=away+offset,x=p.position.x+Math.sin(angle)*1.2,z=p.position.z+Math.cos(angle)*1.2;
            const y=g.battlefield.GroundHeight(x,z);
            if(Math.abs(y-p.position.y)<.4&&!g.physics.Overlaps(x,y+.04,z,p.radius,1.78)){heading=angle;break;}
          }
          if(heading==null)return false;
          if(p.stance!=="stand")g.Debug.Key(p.stance==="crouch"?"KeyC":"KeyZ");
          const yaw=heading+Math.PI,gap=Math.atan2(Math.sin(yaw-p.yaw-p.aimYaw),Math.cos(yaw-p.yaw-p.aimYaw));
          g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
          g.Debug.Look(Math.max(-30,Math.min(30,-gap/.0022)),0);
          g.Debug.Key("KeyW",Math.abs(gap)<.3);g.Debug.Key("ShiftLeft",true);
          this.evading=true;this.evadeFrames=(this.evadeFrames||0)+1;
          return true;
        },
        Target(maxRange=90) {
          // A real bind has priority over an unobstructed distant rifle target.
          const opponent=g.meleeCombat.qte.active?.attacker;
          if(g.meleeCombat.Active && opponent?.alive)return opponent;
          if(this.observedShot!==g.state.playerShots) {
            this.observedShot=g.state.playerShots;
            if(this.lastTarget && g.state.lastShot?.hitKind==="wall")this.blocked.set(this.lastTarget,g.ai.time+4);
          }
          const eye = g.player.EyePosition;
          return g.ai.soldiers
            .filter(
              (a) =>
                a.side === "ija" &&
                a.alive &&
                !a.scriptedNoncombatant &&
                (this.blocked.get(a.id)||0) < g.ai.time &&
                a.position.distanceTo(eye) < maxRange,
            )
            .sort((a, b) => a.position.distanceToSquared(eye) - b.position.distanceToSquared(eye))
            .find((a) => {
              const to = a.position.clone();
              to.y += a.stance === 2 ? 0.3 : a.stance === 1 ? 0.85 : 1.2;
              const d = to.sub(eye),
                length = d.length(),
                hit = g.battlefield.Raycast(eye, d.normalize(), length, {terrain:true});
              return !hit || hit.t >= length - 0.25;
            });
        },
        Shoot(foe) {
          if(g.meleeCombat.Active){
            g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
            g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);return;
          }
          this.lastTarget=foe.id;
          g.Debug.Mouse(0, false);
          const eye = g.player.EyePosition,
            to = foe.position.clone();
          to.y += foe.stance === 2 ? 0.3 : foe.stance === 1 ? 0.85 : 1.2;
          const dx = to.x - eye.x,
            dz = to.z - eye.z,
            yaw = Math.atan2(-dx, -dz),
            gap = Math.atan2(Math.sin(yaw - g.player.yaw), Math.cos(yaw - g.player.yaw));
          g.player.yaw += Math.max(-0.06, Math.min(0.06, gap));
          g.player.pitch = Math.atan2(to.y - eye.y, Math.hypot(dx, dz)) - g.player.aimPitch;
          g.player.yaw -= g.player.aimYaw;
          const distance=foe.position.distanceTo(g.player.position),fighter=g.meleeCombat.Fighter(g.player);
          // Mobile enemies now reach real bayonet contact. The campaign maps V
          // to the equipped melee slot (Dadao), so keep that weapon out through
          // contact instead of switching back to the rifle on every frame.
          if(distance<3 && Math.abs(gap)<.2){
            g.Debug.Mouse(2,false);
            if(g.state.activeSlot!=="melee"){g.Debug.Key("KeyV");return;}
            if(!fighter.weapon)return;
            this.meleeResponses=(this.meleeResponses||0)+1;
            if(g.meleeCombat.Active){g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);}
            else if(fighter.state==="idle"){
              const attacker=g.meleeCombat.Fighter(foe);
              if(attacker.attack && attacker.t>attacker.attack.windup-.13 && attacker.t<attacker.attack.windup
                && distance<attacker.attack.reach){g.Debug.Mouse(2,true);g.Debug.Mouse(2,false);}
              else if(distance<2.3){g.Debug.Mouse(0,true);g.Debug.Mouse(0,false);}
            }
            return;
          }
          if(g.state.activeSlot!=="primary"){g.Debug.Key("Digit1");return;}
          g.Debug.Mouse(2, true);
          if (g.state.ammo === 0) g.Debug.Key("KeyR");
          else if (Math.abs(gap) < 0.06) g.Debug.Mouse(0, true);
        },
      };
    });
    if(stageFrom===1) {
    if(stageJumps){
      await PlayFirstLevelOpening(page,{out:path.join(output,"Opening1"),through:"Unloading"});
      await JumpStage(2);
      await PlayFirstLevelOpening(page,{out:path.join(output,"Opening2"),from:"Unloading",through:"TrenchEntry"});
      await JumpStage(3);
      await PlayFirstLevelOpening(page,{out:path.join(output,"Opening3"),from:"TrenchEntry",mount:false});
    }else await PlayFirstLevelOpening(page,{out:path.join(output,"Opening"),audioClock:audioCheck,mount:false,regroup:process.argv.includes('--regroup'),retryCheckpoint:RetryCampaign});
    await page.evaluate(()=>{window.villageBodies=window.Tengxian.ai.soldiers.filter(a=>["VillageGunner","VillageCorner","KitchenGuard","RearWindow","SideYard","AmbushLead","AmbushRearA","AmbushRearB","AmbushFlank"].includes(a.missionId)).map(a=>({id:a.id,missionId:a.missionId}));});
    const opening=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
    assert.ok(opening.facts.includes("frontRifleDefense")&&opening.facts.includes("rifleWithdrawalResolved")&&opening.facts.includes("zhouGunWounded"));
    assert.ok(opening.guards.slice(0,2).every(g=>g.safe||!g.alive)&&opening.guards.slice(2).every(g=>!g.safe),
      "rifle cover resolves only the first pair before the MG, with real casualties retained");
    assert.ok(opening.guards.slice(0,2).some(g=>g.safe&&g.alive),"rifle cover must actually save a living guard");
    assert.ok(opening.opening.peakPlayerShooters<=3&&opening.opening.playerShots>0,"finite enemy fire slots issue actual shots at the player");
    const marchEvidence=await page.evaluate(()=>window.OpeningInput.marchEvidence);
    await fs.writeFile(path.join(output,"Data_SquadMarchIntegration.json"),JSON.stringify(marchEvidence,null,2));
    if(!stageJumps){
      assert.ok(marchEvidence.some(e=>e.status==="resting"&&e.role==="member"),"shared controller produces an actual rest during the opening approach");
      assert.ok(marchEvidence.filter(e=>e.status==="resting").every(e=>e.role!=="leader"&&e.speed<.12),"leader exemption and physical stops reach the real actors");
    }
    if(process.argv.includes("--march-only")){console.log("PASS shared squad march on the normal rebuilt opening");break campaignRun;}
    await JumpStage(4);
    // 04 一进来玩家就站在机枪座上，也就是关中过场的触发圈里。等它播完再按 F ——
    // 过场期间 InputRouter 是掐着的，这一下按下去会被整段吞掉，
    // 症状是「F 没能占住机枪」而不是「过场出了问题」。
    await WaitOutCutscene("MachineGunMount");
    await page.evaluate(() => {
      const g = window.Tengxian;
      g.Debug.Key("KeyF", true);
      g.StepFrames(90, 1 / 60, false);
      g.Debug.Key("KeyF", false);
    });
    const occupied = await page.evaluate(() => ({
      mounted: window.Tengxian.emplacement.Mounted,
      view: window.Tengxian.emplacement.View(),
      interaction: window.Tengxian.Debug.Interaction?.(),
    }));
    assert.ok(occupied.mounted, "F actually occupies the mission machine gun");
    console.log("ok machine gun occupied");
    const frontVisual=await page.evaluate(()=>{
      const g=window.Tengxian,root=g.scene.getObjectByName("Emplacement_MissionGun"),tank=g.scene.getObjectByName("MissionTankTrackDamage");
      const sights=[];
      for(const yaw of [0,.5,-.5]){g.player.yaw=yaw;g.player.pitch=0;g.StepFrames(30,1/60,false);
        // Measure alignment between impacts; keep the real trauma simulation.
        for(let n=0;n<180&&(Math.abs(g.player.shake.pitch)>.01||Math.abs(g.player.shake.rise)>.005);n++)g.StepFrames(1,1/60,false);
        const p=root.getObjectByName("sight").getWorldPosition(g.player.position.clone()).project(g.camera);sights.push({yaw,x:p.x,y:p.y});}
      return {sights,tankModel:!!tank?.getObjectByName("Type89Tank_root_type89Armor"),
        fired:g.ai.soldiers.filter(a=>a.lastFire>0).map(a=>({id:a.missionId||a.id,side:a.side})),
        aliveEnemy:g.ai.soldiers.filter(a=>a.side==="ija"&&a.alive).length,
        gunGroundClearance:root.position.y-g.battlefield.GroundHeight(0,-128)};
    });
    await fs.writeFile(path.join(output,"Data_FrontVisual.json"),JSON.stringify(frontVisual,null,2));
    assert.ok(frontVisual.tankModel,"use the repository Type89Tank authored model");
    assert.ok(frontVisual.sights.every(p=>Math.abs(p.x)<.08&&Math.abs(p.y)<.16),"sight stays in front of shooter while traversing: "+JSON.stringify(frontVisual.sights));
    assert.ok(frontVisual.fired.filter(a=>a.side==="nra").length>=3&&frontVisual.fired.filter(a=>a.side==="ija").length>=3,"both forces visibly engage before the player takes over");
    assert.ok(frontVisual.aliveEnemy>=4,"front contact retains visible living opposition");
    let defense;
    for (let chunk = 0; chunk < 30; chunk++) {
      defense = await page.evaluate(() => {
        const g = window.Tengxian,
          b = (window.missionGunProbe ||= {frames:0});
        for (let i = 0; i < 600; i++) {
          const p = g.player.position,
            gun = g.emplacement.Emplacement("MissionGun");
          if(g.combat.GrenadeThreats(p).length && g.emplacement.Mounted){
            g.Debug.Mouse(0,false);g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);
          }
          if(!g.emplacement.Mounted){
            if(window.MissionInputDriver.EvadeGrenade()){g.StepFrames(1,1/60,false);continue;}
            break;
          }
          const target = g.ai.soldiers
            .filter(
              (a) =>
                a.side === "ija" &&
                a.alive &&
                a.position.z < p.z - 3 &&
                Math.abs(Math.atan2(p.x - a.position.x, p.z - a.position.z) - gun.baseYaw) <
                  gun.arc.yaw - 0.03,
            )
            .sort((a, b) => a.position.distanceToSquared(p) - b.position.distanceToSquared(p))
            .find((a) => {
              const from = g.player.EyePosition.clone(),
                to = a.position.clone();
              to.y += a.stance === 2 ? 0.45 : a.stance === 1 ? 1 : 1.55;
              const d = to.sub(from),
                len = d.length();
              const hit = g.battlefield.Raycast(from, d.normalize(), len, {terrain:true});
              return !hit || hit.t >= len - 0.3;
            });
          if (target) {
            const eye = g.player.EyePosition,
              dx = target.position.x - eye.x,
              dz = target.position.z - eye.z;
            g.player.yaw = Math.atan2(-dx, -dz);
            g.player.pitch = Math.atan2(
              target.position.y +
                (target.stance === 2 ? 0.45 : target.stance === 1 ? 1 : 1.55) -
                eye.y,
              Math.hypot(dx, dz),
            );
            g.Debug.Mouse(0, true);
          } else g.Debug.Mouse(0, false);
          if(g.player.bleeding && g.player.health<85)g.Debug.Key("KeyB");
          if (gun.rounds === 0) g.Debug.Key("KeyR");
          g.Debug.Key("KeyR", !!gun.jam);
          g.StepFrames(1, 1 / 60, false);
          b.frames++;
          if(g.state.lastEmplacedShot && b.lastGunShot!==g.state.lastEmplacedShot.index) {
            b.lastGunShot=g.state.lastEmplacedShot.index;
            (b.gunShots??=[]).push({...g.state.lastEmplacedShot,target:target?{id:target.missionId||target.id,position:target.position.toArray(),stance:target.stance}:null,eye:g.player.EyePosition.toArray()});
          }
          if (g.Debug.FirstLevelMissionRuntime().flow.stage.id !== "MachineGun" || !g.player.alive) break;
        }
        g.Debug.Mouse(0, false);
        g.Debug.Key("KeyR", false);
        return {
          stage: g.Debug.FirstLevelMissionRuntime().flow.stage.id,
          health: g.player.health,
          alive: g.player.alive,
          damage:window.missionDamage?.slice(-12),
          gun: g.emplacement.View(),
          gunStats: { ...g.emplacement.stats },
          shots:b.gunShots,
          mission: g.Debug.FirstLevelMission(),
        };
      });
      console.log(
        "defense",
        JSON.stringify({
          stage: defense.stage,
          health: defense.health,
          gun: defense.gun,
          stats: defense.gunStats,
          guards: defense.mission.guards,
          enemies: defense.mission.enemies.filter((a) => a.alive).length,
        }),
      );
      if (!defense.alive || defense.stage !== "MachineGun") break;
      if(!defense.gun){
        await Route([{x:0,z:-124},{x:0,z:-127.4}],"GrenadeReturnToMachineGun",{stance:"crouch"});
        if(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().stage)==="MachineGun")await Interact();
        continue;
      }
      if(defense.gun.rounds===0 && defense.gun.belts===0) {
        await page.evaluate(()=>{const g=window.Tengxian;g.Debug.Key("KeyF",true);g.StepFrames(1,1/60,false);g.Debug.Key("KeyF",false);});
        await Route([{x:0,z:-124},{x:-2.2,z:-122.5}],"MachineGunResupply",{stance:"crouch"});
        await Interact();
        if(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().stage)==="MachineGun") {
          await Route([{x:0,z:-124},{x:0,z:-127.4}],"ReturnToMachineGun",{stance:"crouch"});
          if(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().stage)==="MachineGun")await Interact();
        }
      }
    }
    await page.evaluate(() => window.Tengxian.StepFrames(1, 1 / 60, true));
    await page.screenshot({ path: path.join(output, "Scene_MachineGun.png") });
    await fs.writeFile(path.join(output, "Data_Defense.json"), JSON.stringify(defense, null, 2));
    assert.ok(defense.alive, "Player survives covered emplacement");
    assert.equal(defense.stage, "Tank", "Actual guards pass under player machine gun support");
    assert.ok(defense.mission.guards.some(guard=>guard.safe&&guard.alive),"a normal rescue must bring living guards back, not pass by losing all eight");
    const tankCraters=await page.evaluate(()=>({tank:window.Tengxian.Debug.FirstLevelMission().tank,terrain:window.Tengxian.battlefield.deformation.State()}));
    await fs.writeFile(path.join(output,"Data_TankShellCraters.json"),JSON.stringify(tankCraters,null,2));
    assert.ok(tankCraters.tank.impacts?.some(hit=>hit.crater),"actual tank fire reaches the shared deformable ground: "+JSON.stringify(tankCraters.tank));
    await page.evaluate(() => {
      const g = window.Tengxian;
      // Grenade evasion can already have vacated the gun at the stage boundary.
      // F then mounts it again and prevents the resupply route from moving.
      if(g.emplacement.View())g.Debug.Key("KeyF");
      g.Debug.Key("KeyB");
    });
    }
    if(stageFrom<=5){
    if(sortieFixture){
      await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(5));
      await page.evaluate(()=>{
        // Isolate 05: prior front encounters represent a completed battle. This is not normal campaign proof.
        const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
        for(const actor of r.enemies.values())if(["front","machineGun","approach"].includes(actor.missionEncounter))actor.TakeHit(1000,"head",g.player.position.clone());
      });
    }
    await JumpStage(5);
    await Route([{x:0,z:-124},{x:-2.2,z:-122.5}],"FrontResupply",{stance:"crouch"});
    // The expanded battle may have used this box just before the handover.
    // Wait its real cooldown in cover before testing another physical refill.
    await page.evaluate(seconds=>window.Tengxian.StepFrames(Math.ceil(seconds*60),1/60,false),R.supplyCooldownS+1);
    const clipsBefore=await page.evaluate(()=>window.Tengxian.state.clips);
    const reserveBefore=await page.evaluate(()=>window.Tengxian.emplacement.Emplacement("MissionGun").belts);
    await Interact();
    assert.equal(await page.evaluate(()=>window.Tengxian.state.clips),clipsBefore+R.frontSupplyClips,"physical front supply covers the expanded approach ammunition cost");
    const reserveAfter=await page.evaluate(()=>window.Tengxian.emplacement.Emplacement("MissionGun").belts);
    assert.ok(reserveAfter>reserveBefore,"front box physically replenishes machine-gun reserve");
    // The longer sortie warrants taking real dressings from the existing supply box.
    for(let refill=0;refill<3 && await page.evaluate(()=>window.Tengxian.player.bandages)<3;refill++){
      await page.evaluate(seconds=>window.Tengxian.StepFrames(Math.ceil(seconds*60),1/60,false),R.supplyCooldownS+1);
      await Interact();
    }
    await Route([{x:0,z:-124},...Routes.bundle,{x:A.bundle.x,z:A.bundle.z+1.2}],"BundleSupply",{stance:"stand",sprint:true,fight:true,crawl:true});
    await page.evaluate(()=>{const g=window.Tengxian;if(g.player.bleeding)g.Debug.Key("KeyB");g.StepFrames(1,1/60,false);});
    console.log("bundle interaction", await Interact());
    const fullBundleCount=await page.evaluate(()=>window.Tengxian.state.bundles);
    assert.equal(fullBundleCount,R.bundleSupplyCount,"actual crate interaction grants the authored bundle reserve");
    assert.ok(await page.evaluate(minimum=>window.Tengxian.player.bandages>=minimum,R.bundleSupplyBandages),'actual depot pickup supplies the return-leg dressings');
    await Interact();
    assert.equal(await page.evaluate(()=>window.Tengxian.state.bundles),fullBundleCount,"repeated pickup never adds beyond the crate reserve");
    for(let attempt=0;attempt<2;attempt++){
      const miss=await page.evaluate(()=>{
        const g=window.Tengxian,before=g.state.bundles;
        if(g.player.stance!=="stand")g.Debug.Key(g.player.stance==="prone"?"KeyZ":"KeyC");
        g.player.yaw=-Math.PI/2;g.player.pitch=.95;
        g.Debug.Key("KeyH",true);g.StepFrames(66,1/60,false);g.Debug.Key("KeyH",false);g.StepFrames(1,1/60,false);
        // Duck behind the house wall while the real fuse runs. An additional
        // seven-second exposed idle per throw is not part of the inventory contract.
        if(g.player.stance==="stand")g.Debug.Key("KeyC");
        for(let frame=0;frame<240&&g.player.alive;frame++){
          if(g.player.bleeding)g.Debug.Key("KeyB");
          g.StepFrames(1,1/60,false);
        }
        return {before,count:g.state.bundles,alive:g.player.alive,health:g.player.health,damage:window.missionDamage?.slice(-5)};
      });
      console.log('MISSED_BUNDLE',JSON.stringify(miss));
      // Death can cancel the wind-up before release. This is not a throw and
      // must not be counted as one; use the same bounded normal retry budget,
      // then physically make that still-required throw after recovery.
      if(!miss.alive&&miss.count===miss.before){
        assert.ok(await RetryCampaign({rewalk:false}),'pre-release death uses the existing campaign checkpoint budget');
        attempt--;continue;
      }
      assert.equal(miss.count,miss.before-1,'the missed throw consumes one actual bundle');
      // The supply-house checkpoint is already saved by the real pickup.
      // Recovery retains the depleted inventory; never refill before asserting it.
      if(!miss.alive)assert.ok(await RetryCampaign({rewalk:false}),'missed-throw recovery uses the bounded campaign checkpoint budget');
    }
    const spentBundles=await page.evaluate(()=>{
      const g=window.Tengxian;
      return {count:g.state.bundles,mission:g.Debug.FirstLevelMission(),alive:g.player.alive};
    });
    assert.ok(spentBundles.alive&&spentBundles.count===0&&!spentBundles.mission.tank.immobilized,"two missed real throws leave the tank objective active");
    await Interact();
    assert.equal(await page.evaluate(()=>window.Tengxian.state.bundles),fullBundleCount,"an empty player can physically return to the same crate and retry");
    console.log("ok full inventory, two missed throws, empty inventory and actual resupply recovery");
    await Route(Routes.bundleReturn,"TankFlank",{stance:"stand",sprint:true,fight:true,crawl:true});
    await page.evaluate(() => {
      const g = window.Tengxian;
      for (let i = 0; i < 900 && g.Debug.FirstLevelMission().tank.moving; i++)
        g.StepFrames(1, 1 / 60, false);
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      // A thrown bundle may resolve after an ordinary death/retry. Never take
      // another sortie merely because the earlier pre-explosion snapshot was stale.
      if(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().tank.immobilized))break;
      if(attempt>0)await Route([{x:15,z:-111},{x:25,z:-110},{x:30,z:-117}],"TankFlankRetry",
        {stance:"stand",sprint:true,fight:true,crawl:true,rejoinRoute:[...Routes.bundleReturn,...Routes.orders]});
      const thrown = await page.evaluate(() => {
        const g = window.Tengxian,
          tank = g.Debug.FirstLevelMission().tank,
          p = g.player.position;
        g.player.yaw = Math.atan2(p.x - tank.x, p.z - tank.z);
        g.player.pitch = 0.35;
        const distance=Math.hypot(p.x-tank.x,p.z-tank.z)-.4;
        const rise=g.battlefield.GroundHeight(tank.x,tank.z)-(g.player.EyePosition.y+.1);
        const cosine=Math.cos(g.player.pitch),sine=Math.sin(g.player.pitch)+.26;
        const speed=Math.sqrt(4.905*distance*distance/(cosine*cosine*Math.max(.1,distance*sine/cosine-rise)));
        const chargeFrames=Math.round(66*Math.max(.08,Math.min(1,(speed-8)/5)));
        const before = g.state.bundles;
        g.Debug.Key("KeyH", true);
        g.StepFrames(chargeFrames, 1 / 60, false);
        g.Debug.Key("KeyH", false);
        // Finish the release before turning, then physically run back along the side trench.
        g.StepFrames(1,1/60,false);
        if(g.player.stance==="crouch")g.Debug.Key("KeyC");
        g.Debug.Key("ShiftLeft",true);
        const escape=[{x:25,z:-110},{x:15,z:-111}];let escapeIndex=0;
        for(let frame=0;frame<420&&g.player.alive;frame++){
          const p=g.player.position;
          if(escapeIndex<escape.length-1&&Math.hypot(p.x-escape[escapeIndex].x,p.z-escape[escapeIndex].z)<.8)escapeIndex++;
          const dx=escape[escapeIndex].x-p.x,dz=escape[escapeIndex].z-p.z;
          const yaw=Math.atan2(-dx,-dz),gap=Math.atan2(Math.sin(yaw-g.player.yaw),Math.cos(yaw-g.player.yaw));
          g.player.yaw+=Math.max(-.09,Math.min(.09,gap));g.player.pitch=0;
          g.Debug.Key("KeyW",Math.hypot(dx,dz)>.8&&Math.abs(gap)<.6);
          g.StepFrames(1,1/60,false);
        }
        g.Debug.Key("KeyW",false);g.Debug.Key("ShiftLeft",false);
        if(g.player.stance==="stand")g.Debug.Key("KeyC");
        g.StepFrames(1,1/60,false);
        return { before, after: g.state.bundles, health:g.player.health,position:{...g.player.position},damage:window.missionDamage?.slice(-8),mission: g.Debug.FirstLevelMission() };
      });
      console.log(
        "actual bundle throw",
        JSON.stringify({
          before: thrown.before,
          after: thrown.after,
          health:thrown.health,position:thrown.position,damage:thrown.damage,
          tank: thrown.mission.tank,
          explosions: thrown.mission.playerExplosions,
        }),
      );
      if(thrown.health<=0){
        assert.ok(await RetryCampaign({rewalk:false}),"a thrown-bundle death uses the existing bounded checkpoint budget");
        // Taking the bundle saves the house; reaching Orders saves the actual
        // front position instead. Rejoin the return polyline at the real spawn,
        // preserving bends without sending a front checkpoint back to the house.
        await Route(Routes.bundleReturn,"TankCheckpointReturn",{fight:true,stance:"stand",sprint:true,crawl:true,rejoinRoute:Routes.bundleReturn});
      }
      if (await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().tank.immobilized)) break;
    }
    await WaitStage("Orders", 20);
    await JumpStage(6);
    await Route(Routes.orders,"EscortOrders",{stance:"crouch",crawl:true,rejoinRoute:[...Routes.bundleReturn,...Routes.orders]});
    const ordersSupply=await Interact();
    assert.ok(ordersSupply.kind==="supply","covered orders position offers an actual supply interaction");
    await page.evaluate(()=>{const g=window.Tengxian;g.Debug.Key("KeyB");if(g.player.stance!=="crouch")g.Debug.Key("KeyC");g.StepFrames(1,1/60,false);});
    await WaitStage("South", 240);
    // The guard crossing line is followed by a real walk to separate rear posts.
    // Check those stopping points after the tank and orders, when that walk ends.
    const guardArrival=await page.evaluate(()=>{
      const r=window.Tengxian.Debug.FirstLevelMissionRuntime(),guards=r.guards.filter(g=>g.safe&&g.actor.alive);
      return {count:guards.length,arrived:guards.every(g=>g.progress===g.route.length),
        spacing:guards.flatMap((g,i)=>guards.slice(i+1).map(h=>Math.hypot(g.actor.position.x-h.actor.position.x,g.actor.position.z-h.actor.position.z)))};
    });
    if(!sortieFixture)assert.ok(guardArrival.count>0&&guardArrival.arrived,'living withdrawn guards finish their physical rear route');
    assert.ok(guardArrival.spacing.every(d=>d>.8),"withdrawn soldiers do not occupy the same stopping point");
    await JumpStage(7);
    await WaitStage("Village",20);
    await Capture("SouthArrival");
    const withdrawnSquad=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().squad.map(a=>({id:a.castId,alive:a.alive,x:a.position.x,z:a.position.z})));
    console.log("withdrawn squad",JSON.stringify(withdrawnSquad));
    assert.ok(withdrawnSquad.length===4&&withdrawnSquad.every(a=>a.alive&&a.z>-65),"all four companions leave the front trench and follow the southbound column");
    if(process.argv.includes("--through-south")){await Capture("OpeningSquadWithdrawal");console.log(sortieFixture?"PASS sortie fixture: actual route, throws and natural escort transition":"PASS normal opening, gun, tank and four-companion withdrawal");break campaignRun;}
    assert.ok(await page.evaluate(()=>window.villageBodies.every(b=>window.Tengxian.ai.soldiers.some(a=>a.id===b.id&&a.missionId===b.missionId))),"the village reuses its pre-positioned soldiers");
    }
    if(stageFrom<=8) {
    await JumpStage(8);
    // Regroup at the cleared village entrance before assaulting the kitchen.
    // Faster firefights can leave the human-paced followers a few seconds behind;
    // do not make support depend on how long the bot happened to shoot earlier.
    // Only elapsed live simulation: no teleport, mission facts or health overrides.
    const kitchenRegroup=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Members=()=>g.ai.soldiers.filter(a=>["luo","yaowa","heyoutian","liuwencai"].includes(a.castId)&&a.alive);
      const Near=()=>Members().filter(a=>a.position.distanceTo(g.player.position)<15).length;
      const before=Near();let frames=0;
      for(;frames<20*60&&Near()<2&&g.player.Alive;frames++)g.StepFrames(1,1/60,false);
      return {before,near:Near(),seconds:frames/60,alive:g.player.Alive};
    });
    console.log("kitchen regroup",JSON.stringify(kitchenRegroup));
    assert.ok(kitchenRegroup.alive&&kitchenRegroup.near>=2,"two squadmates regroup within fifteen metres at the entrance within twenty seconds");
    // 屋内伏击：走到灶屋南门口停住，老周这一副担架跟进来（docs/Data_FirstLevelRoomAmbush.md）。
    await Route(
      [
        { x: 58, z: -20 },
        { x: 58, z: -9 },
        { x: 58, z: -2.4 },
      ],
      "VillageKitchen",
      { fight: true },
    );
    const kitchenSquad=await page.evaluate(()=>{const g=window.Tengxian;return g.ai.soldiers.filter(a=>["luo","yaowa","heyoutian","liuwencai"].includes(a.castId)).map(a=>({id:a.castId,distance:a.position.distanceTo(g.player.position),alive:a.alive,x:a.position.x,z:a.position.z}));});
    console.log("kitchen squad",JSON.stringify(kitchenSquad));
    assert.ok(kitchenSquad.filter(a=>a.alive&&a.distance<25).length>=2,"at least two squadmates provide nearby kitchen support after the continuous march");
    assert.ok(kitchenSquad.filter(a=>a.alive).every(a=>a.distance<45),"no living squadmate remains abandoned at the front during village support");
    // 老周这一副担架跟着顺子穿过灶屋（跟随间距 ambushLitterFollowGapM，永远不越过玩家）；
    // 其余九副留在村口的南行道路上。给它一段活的模拟时间收拢，不改任何事实、不瞬移。
    const litterFollow=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Zhou=()=>g.Debug.FirstLevelMission().column.litters.find(l=>l.zhou);
      let frames=0;
      for(;frames<12*60&&Zhou().state==="moving"&&g.player.Alive;frames++)g.StepFrames(1,1/60,false);
      const zhou=Zhou(),yaowa=g.ai.soldiers.find(a=>a.castId==="yaowa"),p=g.player.position;
      return {seconds:frames/60,zhou:{x:zhou.x,z:zhou.z,state:zhou.state,bearers:[...zhou.bearers]},
        gapM:Math.hypot(zhou.x-p.x,zhou.z-p.z),player:{x:p.x,z:p.z},
        yaowa:yaowa?{x:yaowa.position.x,z:yaowa.position.z,distance:Math.hypot(yaowa.position.x-zhou.x,yaowa.position.z-zhou.z)}:null,
        others:g.Debug.FirstLevelMission().column.litters.filter(l=>!l.zhou).map(l=>+l.z.toFixed(1))};
    });
    console.log("ambush litter follow",JSON.stringify(litterFollow));
    assert.ok(litterFollow.zhou.z>-9,"Zhou's litter physically follows the player through the kitchen: "+JSON.stringify(litterFollow));
    assert.ok(litterFollow.gapM<=R.ambushLitterFollowGapM+2.5,"the litter keeps station just behind the player");
    assert.ok(litterFollow.zhou.bearers.every(h=>h>0),"both bearers are still carrying when the player reaches the room");
    assert.ok(litterFollow.yaowa&&litterFollow.yaowa.distance<8,"Yaowa comes in with the litter, as Luo ordered");
    assert.ok(litterFollow.others.every(z=>z<litterFollow.zhou.z-3),"the other nine litters stay back at the village entrance");
    await CaptureFocus("AmbushLitterFollow",{x:litterFollow.zhou.x,z:litterFollow.zhou.z,height:.8});
    // 真的走进屋：innerCourtReached 由实际位置记录，阶段自己推进到 Melee（公开阶段 9）。
    // 只走到刚跨进触发圈就停，把伏击那一拍完整留给下面的驱动。
    const enterRoom=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Stage=()=>g.Debug.FirstLevelMissionRuntime().flow.stage.id;
      let frames=0;
      for(;frames<40*60&&Stage()==="Village"&&g.player.Alive;frames++){
        const p=g.player.position,target={x:58,z:6};
        const yaw=Math.atan2(p.x-target.x,p.z-target.z);
        const gap=Math.atan2(Math.sin(yaw-g.player.yaw),Math.cos(yaw-g.player.yaw));
        g.player.yaw+=Math.max(-.06,Math.min(.06,gap));g.player.pitch=0;
        g.Debug.Key("KeyW",Math.abs(gap)<.6);
        g.StepFrames(1,1/60,false);
      }
      g.Debug.Key("KeyW",false);
      const mission=g.Debug.FirstLevelMission();
      return {seconds:frames/60,stage:mission.stage,alive:g.player.Alive,
        position:{...g.player.position},facts:mission.facts.filter(id=>id==="innerCourtReached"||id.startsWith("ambush"))};
    });
    console.log("ambush enter",JSON.stringify(enterRoom));
    assert.ok(enterRoom.alive,"the player survives the walk into the room");
    assert.equal(enterRoom.stage,"Melee","stepping into the inner court advances the mission by itself");
    await JumpStage(9);
    // 一步踏进触发圈：埋伏起身、视线被甩到刺刀上、控制权被锁。
    const trigger=await page.evaluate(async()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      if(g.state.activeSlot==="melee")g.Debug.Key("Digit1");
      let frames=0;
      for(;frames<30*60&&!Mission().facts.includes("ambushTriggered")&&g.player.Alive;frames++){
        const p=g.player.position,target={x:58,z:6};
        const yaw=Math.atan2(p.x-target.x,p.z-target.z);
        const gap=Math.atan2(Math.sin(yaw-g.player.yaw),Math.cos(yaw-g.player.yaw));
        g.player.yaw+=Math.max(-.06,Math.min(.06,gap));g.player.pitch=0;
        g.Debug.Key("KeyW",Math.hypot(p.x-target.x,p.z-target.z)>1&&Math.abs(gap)<.6);
        g.StepFrames(1,1/60,false);
      }
      g.Debug.Key("KeyW",false);
      const mission=Mission();
      const zhou=mission.column.litters.find(l=>l.zhou);
      return {seconds:frames/60,stage:mission.stage,control:mission.control,ambush:mission.ambush,
        facts:mission.facts.filter(id=>id.startsWith("ambush")),
        zhou:{x:zhou.x,z:zhou.z},player:{x:g.player.position.x,z:g.player.position.z},
        protectedPlayer:g.player.Protected===true,health:g.player.health};
    });
    console.log("ambush trigger",JSON.stringify(trigger));
    assert.equal(trigger.stage,"Melee");
    assert.equal(trigger.control,"ambush","the ambush takes the player's hands and eyes");
    assert.equal(trigger.protectedPlayer,false,"the scripted lock must NOT make the player invulnerable — the stab has to land");
    assert.ok(trigger.ambush.litterAtDoor,"the litter party is in the room doorway when the ambush springs: "+JSON.stringify(trigger.zhou));
    const ambushRoom={minX:52.6,maxX:63.4,minZ:1,maxZ:15};
    assert.ok(trigger.ambush.actors.every(a=>a.alive&&a.x>ambushRoom.minX&&a.x<ambushRoom.maxX&&a.z>ambushRoom.minZ&&a.z<ambushRoom.maxZ),
      "every ambusher actually stands inside the room — the physical spawn must not push one through a wall: "+JSON.stringify(trigger.ambush.actors));
    // 锁住的那一刻玩家看到的：视线已经被甩到顶上来的刺刀上。
    await Capture("AmbushTrigger");
    // 先把**失败那条路**跑一遍：抓枪那一下不按 → 刀捅进去 → 阵亡 → 检查点重试，
    // 这一拍要能干干净净地从头重放（没有留下的控制锁、提示环、恍惚或半截事实）。
    const failure=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      let frames=0,sawPrompt=false;
      for(;frames<26*60&&g.player.Alive;frames++){
        const mission=Mission();
        if(mission.ambush.promptView?.mode==="press")sawPrompt=true;
        if(mission.facts.includes("ambushBladeLanded")&&!g.player.Alive)break;
        g.StepFrames(1,1/60,false);
      }
      for(;frames<32*60&&g.player.Alive;frames++)g.StepFrames(1,1/60,false);
      const mission=Mission();
      return {seconds:frames/60,sawPrompt,alive:g.player.Alive,health:g.player.health,
        bladed:mission.facts.includes("ambushBladeLanded"),
        broken:mission.facts.includes("ambushBroken"),
        phase:mission.ambush.phase,failureReason:mission.ambush.failure};
    });
    console.log("ambush failure",JSON.stringify(failure));
    assert.ok(failure.sawPrompt,"the grab prompt really appears before it can be missed");
    assert.ok(failure.bladed,"missing the grab puts the bayonet in: "+JSON.stringify(failure));
    assert.equal(failure.failureReason,"grab");
    assert.equal(failure.alive,false,"at post-butt health the shared ground failure damage is lethal");
    assert.ok(!failure.broken,"a death inside the beat never records the release");
    const retry=await page.evaluate(()=>{
      const g=window.Tengxian;
      g.Debug.MenuAct("continueCheckpoint");
      g.StepFrames(4,1/60,false);
      const mission=g.Debug.FirstLevelMission();
      const zhou=mission.column.litters.find(l=>l.zhou);
      const ring=document.querySelector(".hudCinematicPrompt");
      return {stage:mission.stage,alive:g.player.Alive,health:g.player.health,
        control:mission.control,phase:mission.ambush.phase,
        facts:mission.facts.filter(id=>id.startsWith("ambush")||id==="zhouStabbed"),
        daze:mission.ambush.daze,prompt:mission.ambush.promptView,
        qte:g.meleeCombat.Active,fighter:g.meleeCombat.Fighter(g.player).state,
        cinematic:document.querySelector("#hud")?.classList.contains("cinematicBeat")===true,
        ring:ring?.className||null,
        litterAtDoor:mission.ambush.litterAtDoor,
        zhou:{x:zhou.x,z:zhou.z,health:zhou.health,stabbed:!!zhou.stabbed,bearers:[...zhou.bearers]},
        ambushers:mission.ambush.actors,
        position:{...g.player.position}};
    });
    console.log("ambush retry",JSON.stringify(retry));
    assert.equal(retry.stage,"Melee","the checkpoint retry lands back on this very step");
    assert.ok(retry.alive&&retry.health>0,"the retry restores the player");
    assert.equal(retry.phase,"waiting","the beat is armed again, not resumed half-way");
    assert.deepEqual(retry.facts,[],"every fact this beat recorded is rolled back");
    assert.equal(retry.control,null,"no stale control lock survives the retry");
    assert.equal(retry.qte,false,"no stale QTE survives the retry");
    assert.equal(retry.daze,null,"the eyelids, blur and muffled hearing are reset");
    assert.equal(retry.prompt,null);
    assert.ok(!retry.cinematic,"the HUD is back");
    assert.ok(!retry.ring||!retry.ring.includes("on"));
    assert.ok(retry.zhou.bearers.every(h=>h>0)&&!retry.zhou.stabbed,"the litter party is whole again at the door");
    assert.ok(retry.ambushers.every(a=>a.alive),"the four ambushers are hidden and alive again");
    assert.ok(["idle","rise"].includes(retry.fighter),"he is on his feet for the replay: "+retry.fighter);
    // 枪托那一下：真的掉血、真的倒地（共用 down 状态 + 地面镜头），HUD 整块让位。
    const knocked=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      let frames=0,healthBefore=g.player.health,struckAt=null,qteDuringDaze=false;
      for(;frames<12*60&&g.player.Alive;frames++){
        g.StepFrames(1,1/60,false);
        const mission=Mission();
        if(struckAt==null&&mission.facts.includes("ambushStabbed"))struckAt=frames/60;
        if(g.meleeCombat.Active)qteDuringDaze=true;
        if(struckAt!=null&&frames/60>struckAt+.9)break;
      }
      const mission=Mission(),lead=mission.ambush.actors.find(a=>a.id==="AmbushLead");
      return {seconds:frames/60,struckAt,qteDuringDaze,
        phase:mission.ambush.phase,control:mission.control,
        protectedPlayer:g.player.Protected===true,
        fighter:g.meleeCombat.Fighter(g.player).state,
        cameraDrop:g.player.meleeCameraDrop,
        leadDistanceM:Math.hypot(lead.x-g.player.position.x,lead.z-g.player.position.z),
        healthBefore,health:g.player.health,
        daze:mission.ambush.daze,
        cinematic:document.querySelector("#hud")?.classList.contains("cinematicBeat")===true,
        meleeCard:document.querySelector(".hudMeleeQte")?.className||null,
        ring:document.querySelector(".hudCinematicPrompt")?.className||null};
    });
    console.log("ambush butt",JSON.stringify(knocked));
    assert.ok(knocked.struckAt!=null,"the rifle butt lands: "+JSON.stringify(knocked));
    assert.ok(knocked.health<knocked.healthBefore,"the butt really wounds the player under the lock");
    assert.equal(knocked.control,"ambush","he is still held while the litter party is being killed");
    assert.equal(knocked.protectedPlayer,false);
    assert.ok(["fall","down"].includes(knocked.fighter),
      "he is really knocked to the floor through the shared melee state: "+JSON.stringify(knocked));
    assert.ok(knocked.cameraDrop>.2,"the first-person camera actually falls to the floor");
    assert.equal(knocked.qteDuringDaze,false,"no shared QTE runs while he is only lying there");
    assert.ok(knocked.cinematic,"the HUD gives way for the whole locked take");
    assert.ok(!knocked.meleeCard||!knocked.meleeCard.includes("on"),"the shared QTE card stays off this beat");
    assert.ok(knocked.leadDistanceM<=R.ambushBindReachM+.6,
      "the lead actually closed before swinging: "+JSON.stringify(knocked));
    await Capture("AmbushButtStrike");
    // 躺着的那几秒：眼皮闭上过、视线被拉到北门口的担架上，担架队一个个被捅穿。
    const dazed=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      let frames=0,maxEyeClosure=0,maxBlur=0,bearerAt=null;
      for(;frames<14*60&&g.player.Alive;frames++){
        const mission=Mission();
        maxEyeClosure=Math.max(maxEyeClosure,mission.ambush.daze?.eyeClosure||0);
        maxBlur=Math.max(maxBlur,mission.ambush.daze?.focus||0);
        if(bearerAt==null&&mission.column.bearerCasualties.length>=1)bearerAt=frames/60;
        if(mission.facts.includes("zhouStabbed"))break;
        g.StepFrames(1,1/60,false);
      }
      const mission=Mission();
      const zhou=mission.column.litters.find(l=>l.zhou);
      const rearB=g.ai.soldiers.find(a=>a.missionId==="AmbushRearB");
      const bed=g.scene.getObjectByName("MissionOriginalZhouStretcher");
      return {seconds:frames/60,maxEyeClosure,maxBlur,bearerAt,
        phase:mission.ambush.phase,control:mission.control,
        stabbed:mission.facts.includes("zhouStabbed"),
        broken:mission.facts.includes("ambushBroken"),
        fighter:g.meleeCombat.Fighter(g.player).state,
        daze:mission.ambush.daze,
        zhou:{x:zhou.x,z:zhou.z,health:zhou.health,stabbed:!!zhou.stabbed,state:zhou.state},
        // 床面高度（屋里地面高度 0）：担架落地之前 0.76 m，落地之后 0.22 m。
        bedY:bed?+bed.position.y.toFixed(2):null,
        // 捅他的那个真的站到担架边上了（走位扣掉了共用到达半径）
        rearB:rearB?{x:+rearB.position.x.toFixed(2),z:+rearB.position.z.toFixed(2),
          gapM:+Math.hypot(rearB.position.x-zhou.x,rearB.position.z-zhou.z).toFixed(2),
          clip:rearB.missionAmbushClip?.clipId||null}:null,
        bearerCasualties:mission.column.bearerCasualties.length,
        alive:g.player.Alive};
    });
    console.log("ambush daze",JSON.stringify(dazed));
    assert.ok(dazed.maxEyeClosure>.9,"the blackout really closes his eyes: "+JSON.stringify(dazed));
    assert.ok(dazed.stabbed,"Zhou is bayoneted while the player is on the floor: "+JSON.stringify(dazed));
    assert.equal(dazed.control,"ambush","the blade lands inside the control lock, not after it");
    assert.equal(dazed.fighter,"down","he is still on his back when it happens");
    assert.ok(!dazed.broken,"the release is recorded after the blade, never before");
    assert.ok(dazed.bearerCasualties>=1,"a bearer falls before Zhou does: "+JSON.stringify(dazed));
    assert.ok((dazed.daze?.focus ?? 1)<=.5,
      "the blur has cleared enough to recognise the man doing it: "+JSON.stringify(dazed));
    // 那一刀必须落在**还举着的**担架上：BayonetStabDown 是按 0.86 m 的床面烘的，
    // 床面一提前摔到地上（0.22 m），刀尖就停在老周上方大半米的空气里。
    assert.notEqual(dazed.zhou.state,"fallen",
      "the litter is still held up at the moment the blade goes in: "+JSON.stringify(dazed.zhou));
    assert.ok(dazed.bedY>.5,"the stretcher deck is still at carry height: "+JSON.stringify(dazed));
    // 捅他的那个真的站到了担架边上（站位 ambushZhouStabStandM + 沿长边错开，
    // 走位走 DriveAmbusherOnto 把共用到达半径 0.45 m 先扣掉）。
    assert.ok(dazed.rearB&&dazed.rearB.gapM<=Math.hypot(R.ambushZhouStabStandM,R.ambushZhouStabLateralM)+.35,
      "the man stabbing Zhou is at bayonet reach of the litter, not stopped short: "+JSON.stringify(dazed.rearB));
    await Capture("AmbushZhouStab");
    // 他扑上来压刺刀：屏幕上只有一个环，带着绑定表里的那个键面字。
    const grab=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      let frames=0;
      for(;frames<12*60&&g.player.Alive&&Mission().ambush.phase!=="grab";frames++)g.StepFrames(1,1/60,false);
      // 视线转回他身上要 ambushLookSeconds(0.35)：转完再读环的落点。
      g.StepFrames(30,1/60,false);frames+=30;
      const mission=Mission();
      const lead=g.ai.soldiers.find(a=>a.missionId==="AmbushLead");
      const ring=document.querySelector(".hudCinematicPrompt");
      const box=ring?.getBoundingClientRect?.();
      // 近景那把枪与那两只手（2026-09-16 打磨轮加的三条，见 docs §4.3）：
      //   detail   压住玩家那个按 high 档建武器（低画质下刺刀才不是一根黑方块）
      //   arms     第一人称是导入的骨骼双臂，不是兜底的旧手模
      //   handOff  共用地面姿势之上叠的那份手位偏移（把枪与手从他脸上挪开）
      const actor=lead?g.ai.soldiers.find(a=>a.missionId==="AmbushLead")?.actor:null;
      const weapons=g.actorFactory?.MeshStatus?.()?.weapons||{};
      const detailKeys=Object.keys(weapons).filter(key=>key.endsWith("|detail"));
      const vm=g.viewmodel;
      return {seconds:frames/60,phase:mission.ambush.phase,control:mission.control,
        prompt:mission.ambush.promptView,
        fighter:g.meleeCombat.Fighter(g.player).state,
        leadClip:lead?g.meleeCombat.Fighter(lead).clip:null,
        leadState:lead?g.meleeCombat.Fighter(lead).state:null,
        leadWeapon:actor?actor.weaponId:null,
        leadWeaponDetail:actor?actor.weaponDetail===true:null,
        detailKeys,
        // 上着刀的那一份必须走模型（低画质默认是一根方块刀片）
        detailBayonet:weapons[`${actor?.weaponId}|${actor?.weaponVariant??0}|${g.actorFactory.quality}|bayonet|detail`]||null,
        leadBayonetFixed:actor?.bayonetFixed===true,
        arms:!!vm?.riggedArms&&vm.riggedArms.root?.visible!==false,
        rigSource:vm?.rigSource||null,
        gunVisible:vm?.root?.visible===true,
        handOffset:vm?.scriptedHandOffset?{...vm.scriptedHandOffset}:null,
        ring:ring?.className||null,
        ringKey:ring?.querySelector(".cpKey")?.textContent||null,
        onScreen:!!box&&box.left>=0&&box.top>=0&&box.right<=window.innerWidth&&box.bottom<=window.innerHeight,
        meleeCard:document.querySelector(".hudMeleeQte")?.className||null,
        hidden:["hudCrosshair","hudCombat","hudTop","hudHint","hudMarkers"].map(cls=>{
          const el=document.querySelector("."+cls);
          return el?getComputedStyle(el).opacity:"0";
        }),
        alive:g.player.Alive};
    });
    console.log("ambush grab prompt",JSON.stringify(grab));
    assert.equal(grab.phase,"grab","the lead comes down on him with the blade");
    assert.equal(grab.prompt?.mode,"press","one single-press prompt, not the shared card");
    assert.ok(grab.ring&&grab.ring.includes("on"),"the ring is actually on screen");
    assert.equal(grab.ringKey,"F","the glyph comes from the input binding table");
    assert.ok(grab.onScreen,"the ring is clamped inside the safe area: "+JSON.stringify(grab));
    assert.equal(grab.fighter,"down");
    assert.equal(grab.leadClip,"Pressure","he is holding the bayonet over the player, not standing up");
    assert.equal(grab.leadState,"qte");
    assert.ok(grab.hidden.every(opacity=>Number(opacity)===0),
      "crosshair, ammo, objective, hint and markers are all gone: "+JSON.stringify(grab.hidden));
    // 半米外怼着脸的那把枪必须是真枪：低画质（本测试就是 quality=low）默认把刺刀
    // 画成一根方块，所以这一拍给压住玩家那个单独挂近景档（Actor.SetWeaponDetail）。
    assert.equal(grab.leadWeapon,"Type38");
    assert.equal(grab.leadWeaponDetail,true,
      "the lead carries the detailed weapon while he is in the player's face: "+JSON.stringify(grab));
    assert.equal(grab.leadBayonetFixed,true,"he is holding a fixed bayonet, not a bare rifle");
    assert.ok(grab.detailKeys.some(key=>key.includes("bayonet")),
      "the close-up build includes the bayoneted rifle: "+JSON.stringify(grab.detailKeys));
    assert.equal(grab.detailBayonet,"model",
      "and that blade comes from the bayonet model, not the low-tier box: "+JSON.stringify(grab));
    // 第一人称这一侧：手是导入的骨骼双臂，而且整套被挪开了他的脸。
    assert.ok(grab.gunVisible,"the first-person hands are back for the grapple");
    assert.ok(grab.arms&&/riggedArms/.test(grab.rigSource||""),
      "the grapple shows the production first-person arms: "+JSON.stringify(grab.rigSource));
    assert.ok(grab.handOffset&&grab.handOffset.y<-.1&&grab.handOffset.z<-.1,
      "the scripted hand offset is applied while he is pinned: "+JSON.stringify(grab.handOffset));
    await Capture("AmbushPounce");
    // 抓住枪：一下 F 进共用地面 QTE，同一个环变成连按表。
    const mash=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);
      g.StepFrames(2,1/60,false);
      const mission=Mission();
      const ring=document.querySelector(".hudCinematicPrompt");
      return {phase:mission.ambush.phase,prompt:mission.ambush.promptView,
        qte:g.meleeCombat.qte.active?{kind:g.meleeCombat.qte.active.kind,windowS:g.meleeCombat.qte.active.windowS}:null,
        grabbed:mission.facts.includes("ambushGrabbed"),
        ring:ring?.className||null,
        meleeCard:document.querySelector(".hudMeleeQte")?.className||null,
        alive:g.player.Alive};
    });
    console.log("ambush mash",JSON.stringify(mash));
    assert.equal(mash.phase,"mash","one press in time gets both hands on the rifle");
    assert.ok(mash.grabbed);
    assert.equal(mash.qte?.kind,"ground","the push uses the shared ground QTE");
    assert.ok(mash.qte.windowS<=4.8&&mash.qte.windowS<=R.ambushQteWindowS,
      "the scripted window stays inside the shared QTE rule and this beat's own cap");
    assert.ok(!mash.meleeCard||!mash.meleeCard.includes("on"),"the shared card is still off");
    // 连按到推赢。环上的进度就是共用 QTE 的 progress。
    const pushed=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      let frames=0,presses=0,sawMashRing=false;
      for(;frames<12*60&&g.player.Alive&&g.meleeCombat.Active;frames++){
        if(frames%10===0){g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);presses++;}
        const prompt=Mission().ambush.promptView;
        if(prompt?.mode==="mash"&&document.querySelector(".hudCinematicPrompt.mash.on"))sawMashRing=true;
        g.StepFrames(1,1/60,false);
      }
      g.Debug.Key("KeyF",false);
      for(;frames<14*60&&g.player.Alive&&Mission().ambush.phase==="mash";frames++)g.StepFrames(1,1/60,false);
      const mission=Mission();
      const ring=document.querySelector(".hudCinematicPrompt");
      return {presses,sawMashRing,seconds:frames/60,phase:mission.ambush.phase,
        prompt:mission.ambush.promptView,control:mission.control,
        ringKey:ring?.querySelector(".cpKey")?.textContent||null,
        ring:ring?.className||null,
        health:g.player.health,alive:g.player.Alive,
        leadAlive:!!g.ai.soldiers.find(a=>a.missionId==="AmbushLead")?.alive};
    });
    console.log("ambush push",JSON.stringify(pushed));
    assert.ok(pushed.presses>=3,"F is actually mashed, not held");
    assert.ok(pushed.sawMashRing,"the same ring is what shows the mash progress");
    assert.equal(pushed.phase,"finish","winning the push does not kill him by itself");
    assert.equal(pushed.prompt?.mode,"finisher");
    assert.ok(pushed.leadAlive,"the shared QTE success never kills — the finisher press does");
    assert.equal(pushed.control,"ambush","he is still on his back with the rifle in both hands");
    await Capture("AmbushGrapple");
    // 反捅：左键那一下才是杀招，领头那个走共用伤害链真的死掉。
    const finisher=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      const Lead=()=>g.ai.soldiers.find(a=>a.missionId==="AmbushLead");
      const before=Lead().health;
      g.Debug.Mouse(0,true);g.Debug.Mouse(0,false);
      g.StepFrames(2,1/60,false);
      const killedAt=Mission().facts.includes("ambushFinisher");
      let frames=0;
      for(;frames<10*60&&g.player.Alive&&Mission().control;frames++)g.StepFrames(1,1/60,false);
      const mission=Mission();
      return {killedAt,seconds:frames/60,control:mission.control,
        leadHealthBefore:before,leadAlive:!!Lead()?.alive,leadHealth:Lead()?.health,
        leadClip:mission.ambush.actors.find(a=>a.id==="AmbushLead")?.clip||null,
        fighter:g.meleeCombat.Fighter(g.player).state,
        cameraDrop:g.player.meleeCameraDrop,
        cinematic:document.querySelector("#hud")?.classList.contains("cinematicBeat")===true,
        ring:document.querySelector(".hudCinematicPrompt")?.className||null,
        facts:mission.facts.filter(id=>id.startsWith("ambush")||id==="zhouStabbed"),
        handOffset:g.viewmodel?.scriptedHandOffset||null,
        health:g.player.health,alive:g.player.Alive};
    });
    console.log("ambush finisher",JSON.stringify(finisher));
    assert.ok(finisher.killedAt,"the left-button press is what drives the bayonet home");
    assert.ok(!finisher.leadAlive,"the lead dies for real, through the shared damage path: "+JSON.stringify(finisher));
    assert.ok(finisher.facts.includes("ambushFinisher"));
    assert.equal(finisher.control,null,"control comes back once he is back on his feet");
    assert.ok(!finisher.cinematic,"the HUD comes back with the hands");
    assert.ok(!finisher.ring||!finisher.ring.includes("on"),"no stale ring is left on screen");
    assert.ok(finisher.cameraDrop<.35,"the camera is off the floor again");
    assert.equal(finisher.handOffset,null,
      "the scripted hand offset is handed back with the controls — it must not follow him into normal play");
    const broke={control:finisher.control,alive:finisher.alive,health:finisher.health,facts:finisher.facts};
    await Capture("AmbushBreak");
    // 挣脱之后是屋里两三米的白刃：三个上刺刀的围着一个人。用真实输入打 ——
    // 近了 V 拔刀、看起手右键拨挡、够得着左键斩，远了才用枪。与白刃试验场同一套手法。
    await page.evaluate(()=>{
      const g=window.Tengxian;
      window.AmbushCombat=()=>{
        const p=g.player;
        const foe=g.ai.soldiers.filter(a=>a.side==="ija"&&a.alive&&!a.scriptedNoncombatant)
          .sort((a,b)=>a.position.distanceToSquared(p.position)-b.position.distanceToSquared(p.position))[0];
        if(p.bleeding&&p.health<80)g.Debug.Key("KeyB");
        if(!foe){g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);return;}
        const d=foe.position.distanceTo(p.position),close=d<3.2;
        // 换手上的家伙有冷却：不加闩的话这一行每帧按一次 V，刀永远拔不出来。
        const canSwap=(window.AmbushSwapAt||0)<=g.ai.time;
        if(close&&g.state.activeSlot!=="melee"&&canSwap&&g.meleeCombat.CanChangeWeapon()){window.AmbushSwapAt=g.ai.time+.6;g.Debug.Key("KeyV");}
        if(!close&&g.state.activeSlot==="melee"&&canSwap){window.AmbushSwapAt=g.ai.time+.6;g.Debug.Key("Digit1");}
        const yaw=Math.atan2(p.position.x-foe.position.x,p.position.z-foe.position.z);
        const gap=Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw));
        p.yaw+=Math.max(-.12,Math.min(.12,gap));p.pitch=0;
        if(!close){g.Debug.Key("KeyW",false);window.MissionInputDriver.Shoot(foe);return;}
        g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
        const Halt=()=>g.Debug.Key("KeyW",false);
        if(g.meleeCombat.Active){Halt();return;}
        const mine=g.meleeCombat.Fighter(p),his=g.meleeCombat.Fighter(foe);
        if(mine.state!=="idle"){Halt();return;}
        if(his.attack&&his.t>his.attack.windup-.14&&his.t<his.attack.windup&&d<his.attack.reach){
          Halt();g.Debug.Mouse(2,true);g.Debug.Mouse(2,false);return;
        }
        // 大刀轻斩够 1.58 m：站在 1.7 m 上挥是空的，先上前一步再砍。
        if(d>1.35){g.Debug.Key("KeyW",true);return;}
        Halt();
        g.Debug.Mouse(0,true);g.Debug.Mouse(0,false);
      };
    });
    assert.equal(broke.control,null,"control comes back once the blade has landed");
    assert.ok(broke.facts.includes("ambushBroken"),"the player always breaks free");
    assert.ok(broke.facts.indexOf("zhouStabbed")>=0
      &&broke.facts.indexOf("zhouStabbed")<broke.facts.indexOf("ambushBroken"),
      "the player watches Zhou take the bayonet, and only then gets his hands back: "+JSON.stringify(broke.facts));
    assert.ok(broke.alive,"he survives the rifle butt and the grapple");
    // 背景里老周挨的那一刀（配音事件驱动）与两个抬担架的：挣脱之后清点战果。
    const litterLoss=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      // 挣脱之后是真打：屋里还有四个上着刺刀的人，站着不动只会被捅死。
      let frames=0;
      for(;frames<3*60&&g.player.Alive;frames++){
        window.AmbushCombat();
        g.StepFrames(1,1/60,false);
      }
      g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
      const mission=Mission();
      const zhou=mission.column.litters.find(l=>l.zhou);
      return {seconds:frames/60,alive:g.player.Alive,health:g.player.health,
        damage:(window.missionDamage||[]).slice(-8).map(d=>({after:Math.round(d.after),amount:Math.round(d.damage),bullet:!!d.bullet,blast:!!d.blast})),
        ambushers:mission.ambush.actors,
        stabbed:mission.facts.includes("zhouStabbed"),
        zhou:{health:zhou.health,state:zhou.state,stabbed:!!zhou.stabbed,bearers:[...zhou.bearers],x:zhou.x,z:zhou.z},
        bearerCasualties:mission.column.bearerCasualties.length};
    });
    console.log("ambush litter losses",JSON.stringify(litterLoss));
    assert.ok(litterLoss.stabbed,"Zhou is bayoneted on the litter: "+JSON.stringify(litterLoss));
    assert.equal(litterLoss.zhou.health,R.ambushZhouHealthAfter,"Zhou survives the belly wound");
    assert.equal(litterLoss.zhou.stabbed,true);
    assert.equal(litterLoss.bearerCasualties,2,"both bearers are killed where they stood");
    assert.ok(litterLoss.zhou.bearers.every(h=>h<=0),"the litter is on the ground with nobody carrying it");
    // 罗班长他们穿灶屋进屋一起打。
    const squadEntry=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Mission=()=>g.Debug.FirstLevelMission();
      // 第一个人跨进门就记事实；再打三秒，让整组真的进屋站住位再看。
      let frames=0,arrivedAt=null;
      for(;frames<30*60&&g.player.Alive;frames++){
        if(arrivedAt==null&&Mission().facts.includes("ambushSquadArrived"))arrivedAt=frames;
        if(arrivedAt!=null&&frames-arrivedAt>=240)break;
        window.AmbushCombat();
        g.StepFrames(1,1/60,false);
      }
      g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
      return {seconds:frames/60,arrivedAtS:arrivedAt==null?null:arrivedAt/60,
        alive:g.player.Alive,health:g.player.health,
        arrived:Mission().facts.includes("ambushSquadArrived"),
        squad:g.ai.soldiers.filter(a=>["luo","heyoutian","liuwencai"].includes(a.castId))
          .map(a=>({id:a.castId,alive:a.alive,x:a.position.x,z:a.position.z}))};
    });
    console.log("ambush squad",JSON.stringify(squadEntry));
    const entered=squadEntry.squad.filter(a=>a.alive).sort((a,b)=>b.z-a.z)[0];
    if(entered)await CaptureFocus("AmbushSquadEntry",{x:entered.x,z:entered.z,height:1.5});
    else await Capture("AmbushSquadEntry");
    assert.ok(squadEntry.arrived,"Luo's men come through the kitchen and into the room: "+JSON.stringify(squadEntry));
    // 屋子北墙墙心 z=0.5、墙厚 0.6：跨过 0.8 就算进了屋。
    assert.ok(squadEntry.squad.filter(a=>a.alive&&a.x>ambushRoom.minX&&a.x<ambushRoom.maxX&&a.z>0.8&&a.z<ambushRoom.maxZ).length>=2,
      "at least two squadmates fight inside the room: "+JSON.stringify(squadEntry.squad));
    // 清屋子：还是白刃手法，别在两米内改回拉栓步枪。
    const clearFight=await page.evaluate(()=>{
      const g=window.Tengxian;
      const Stage=()=>g.Debug.FirstLevelMissionRuntime().flow.stage.id;
      let frames=0;
      for(;frames<120*60&&Stage()==="Melee"&&g.player.Alive;frames++){
        window.AmbushCombat();
        g.StepFrames(1,1/60,false);
      }
      g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
      if(g.state.activeSlot==="melee")g.Debug.Key("Digit1");
      g.StepFrames(1,1/60,false);
      const mission=g.Debug.FirstLevelMission();
      return {seconds:frames/60,stage:mission.stage,alive:g.player.Alive,health:g.player.health,
        enemies:mission.enemies.filter(e=>e.encounter==="melee").map(e=>({id:e.id,alive:e.alive}))};
    });
    console.log("ambush clear",JSON.stringify(clearFight));
    assert.ok(clearFight.alive,"the player survives the room fight with real melee input: "+JSON.stringify(clearFight));
    assert.equal(clearFight.stage,"Courtyard","killing every ambusher advances the mission by itself");
    await Capture("Courtyard");
    const cleared=await page.evaluate(()=>{
      const g=window.Tengxian,mission=g.Debug.FirstLevelMission();
      const zhou=mission.column.litters.find(l=>l.zhou);
      return {ambush:mission.ambush,enemies:mission.enemies.filter(e=>e.encounter==="melee"),
        zhou:{x:zhou.x,z:zhou.z,health:zhou.health,bearers:[...zhou.bearers]},
        bearerCasualties:mission.column.bearerCasualties.length,
        replacements:mission.column.replacements,health:g.player.health};
    });
    console.log("ambush cleared",JSON.stringify(cleared));
    // 收尾这一张对准担架：老周躺着、两个抬担架的成了尸体、屋里四具日军。
    await CaptureFocus("AmbushCleared",{x:cleared.zhou.x,z:cleared.zhou.z,height:.7});
    assert.equal(cleared.enemies.length,4,"all four authored ambushers were actually built");
    assert.ok(cleared.enemies.every(e=>!e.alive),"the step only advances once every ambusher is dead");
    assert.equal(cleared.ambush.phase,"resolved");
    await JumpStage(10);
    if(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.get("VillageGunner")?.alive)) {
      // The ordinary approach may leave this gunner alive after a checkpoint
      // recovery too. Use the existing physical kitchen firing angle whenever
      // the actual objective survives, not only after a debug-stage start.
      await Route([{x:58,z:4.6},{x:58,z:-9},{x:58,z:-20},{x:48,z:-20},
        {x:58,z:-20},{x:58,z:-9},{x:58,z:4.6}],"CourtyardWindowGun",{fight:true});
      assert.ok(await page.evaluate(()=>!window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.get("VillageGunner").alive),"the current window gun is cleared with real fire");
    }
    await Route(
      [
        { x: 58, z: 8 },
        { x: 58, z: 18 },
        { x: 53, z: 24 },
        { x: 53, z: 32.8 },
      ],
      "CourtyardGate",
      { fight: true },
    );
    await Interact();
    assert.ok(
      await page.evaluate(() =>
        window.Tengxian.Debug.FirstLevelMission().facts.includes("courtyardGateOpen"),
      ),
      "F opens the actual courtyard door",
    );
    await Route([{x:53,z:38},{x:57,z:38}], "CourtyardOuterCover", {fight:true});
    const columnFocus=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().column.litters.filter(l=>l.visible&&!l.loaded).sort((a,b)=>Math.hypot(a.x-53,a.z-35)-Math.hypot(b.x-53,b.z-35))[0]);
    if(columnFocus)await CaptureFocus("CourtyardColumn",columnFocus);
    assert.ok(!await page.locator("#hud").innerText().then(text=>/担架已通过|通过[：:]?\s*\d+\s*[\/／]/.test(text)),"passage counts stay out of the player HUD");
    await Route([{x:53,z:35},{x:53,z:32.2},{x:50,z:32.5}],"CourtyardDressings",{fight:true});
    const dressings=await Interact();assert.equal(dressings.kind,"supply","the courtyard medical post provides real supplies");
    await page.evaluate(()=>{const g=window.Tengxian;g.Debug.Key("KeyB");g.StepFrames(1,1/60,false);});
    await Route([{x:53,z:32.2},{x:53,z:38},{x:57,z:38}],"CourtyardWatch",{fight:true});
    await WaitStage("TransferApproach", 360, { fight: true });
    await JumpStage(11);
    await Route(
      [
        { x: 53, z: 37 },
        { x: 64, z: 52 },
        { x: 76, z: 85 },
        { x: 88, z: 92 },
        { x: 89, z: 101 },
        { x: 95, z: 103 },
      ],
      "TransferDefense",
      { fight: true },
    );
    await WaitStage("Transfer", 120, { fight: true });
    }
    if(stageFrom<=12) {
    await JumpStage(12);
    // The crate is at x=93 and has a 2.5 m reach. Route may stop 0.8 m
    // before its endpoint: x=95 can leave the player outside interaction range.
    await Route([{ x: 94.5, z: 110 }], "TransferSupply", { fight: true });
    const transferSupply=await Interact();
    assert.equal(transferSupply.kind,"supply","the transfer crate is actually within reach");
    await Route([{ x: 95, z: 103 }], "TransferPosition", { fight: true });
    await WaitStage("AirFirst", 300, { fight: true, cover: true });
    const transferPacing=await page.evaluate(()=>{const m=window.Tengxian.Debug.FirstLevelMission();return {beats:m.transferBeats,events:m.log.filter(e=>/AttackStarted|AttackCleared|vehiclesDeparted|zhouNext/.test(e.id)),entered:m.log.find(e=>e.kind==="stage" && e.id==="Transfer")?.time,ended:m.time};});
    assert.deepEqual(transferPacing.beats.started,MISSION_TRANSFER_BEATS.map(beat=>beat.id));
    assert.deepEqual(transferPacing.beats.cleared,MISSION_TRANSFER_BEATS.map(beat=>beat.id),"all finite attacks actually resolve before the air raid");
    await fs.writeFile(path.join(output,"Data_TransferPacing.json"),JSON.stringify(transferPacing,null,2));
    console.log("transfer pacing",JSON.stringify(transferPacing));
    // Dress the wounds from the complete defense before carrying Zhou away.
    // The same field box is available again after its real 15-second cooldown.
    await Route([{x:94.5,z:110}],"TransferDepartureSupply",{fight:true,stance:"crouch"});
    const departureBefore=await page.evaluate(()=>{
      const g=window.Tengxian;
      return {count:g.interact.points.get("MissionSupplyTransfer").count,bandages:g.player.bandages};
    });
    const departureSupply=await Interact();
    assert.equal(departureSupply.kind,"supply");
    const departureAfter=await page.evaluate(()=>{
      const g=window.Tengxian;
      return {count:g.interact.points.get("MissionSupplyTransfer").count,bandages:g.player.bandages};
    });
    assert.deepEqual(departureAfter,{count:departureBefore.count+1,bandages:departureBefore.bandages+1},
      "departure uses the actual transfer crate and receives one dressing");
    await fs.writeFile(path.join(output,"Data_DepartureSupplyReceipt.json"),JSON.stringify({before:departureBefore,after:departureAfter},null,2));
    await page.evaluate(()=>window.Tengxian.Debug.Key("KeyB"));
    await JumpStage(13);
    // The aircraft warning arrives while live infantry can still lob grenades
    // at the last firing position. Walk behind the existing supply cover.
    await Route([{x:95,z:107},{x:90,z:107}],"AirWarningCover",{stance:"crouch"});
    await WaitStage("Carry", 30, { fight: true });
    const pickup = await page.evaluate(() => {
      const z = window.Tengxian.Debug.FirstLevelMission().column.litters.find((l) => l.zhou);
      return { x: z.x + Math.sin(z.yaw) * 1.6, z: z.z + Math.cos(z.yaw) * 1.6 };
    });
    await Route([{ x: 90, z: 108 }, pickup], "FirstCarryPickup", { fight: true });
    await Interact();
    assert.equal(await page.evaluate(() => window.Tengxian.carry.KindId), "stretcher");
    const noFire = await page.evaluate(() => {
      const g = window.Tengxian,
        before = g.state.playerShots;
      g.Debug.Fire();
      return g.state.playerShots === before;
    });
    assert.ok(noFire, "Holding a patient prevents shooting");
    await Route(
      [
        { x: 63, z: 112 },
        { x: 53, z: 114 },
      ],
      "CarryToDitch",
    );
    await JumpStage(14);
    await WaitStage("Rescue", stageJumps ? 40 : 12);
    assert.equal(
      await page.evaluate(() => window.Tengxian.carry.Active),
      false,
      "Dive releases the original stretcher",
    );
    await WaitStage("RetreatFirst", 100, { fight: true });
    await JumpStage(15);
    await Route(
      Routes.evacuation.slice(1,3),
      "FirstRearguard",
      { fight: true, stance: "crouch" },
    );
    await WaitStage("RetreatWall", 240, { fight: true, cover:true });
    await Route(
      Routes.evacuation.slice(3,6),
      "WallRearguard",
      { fight: true },
    );
    await Interact();
    await WaitStage("RetreatYard", 180, { fight: true, cover:true });
    await Route(
      Routes.evacuation.slice(6,9),
      "YardRearguard",
      { fight: true },
    );
    await WaitStage("Reception", 180, { fight: true });
    const retreatEncounters=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().enemies.map(actor=>actor.id));
    for(const spec of [...MISSION_ENCOUNTERS.retreatWall,...MISSION_ENCOUNTERS.retreatYard])assert.ok(retreatEncounters.includes(spec.id),"the withdrawal has both authored flank encounters: "+spec.id);
    }
    await JumpStage(16);
    await Route(
      [...Routes.evacuation.slice(9),{x:-13,z:249},{x:-13,z:245}],
      "ReceptionDefense",
      { fight: true },
    );
    await WaitStage("FinalCarry", 180, { fight: true });
    const finalPickup = await page.evaluate(() => {
      const z = window.Tengxian.Debug.FirstLevelMission().column.litters.find((l) => l.zhou);
      return { x: z.x + Math.sin(z.yaw) * 1.6, z: z.z + Math.cos(z.yaw) * 1.6 };
    });
    await Route([finalPickup], "FinalCarryPickup", { fight: true });
    await Interact();
    assert.equal(await page.evaluate(() => window.Tengxian.carry.KindId), "stretcher");
    await Route(
      [{x:-17,z:249},{x:-26,z:249},{x:-26,z:242.8}],
      "DeliverZhou",
    );
    await Interact();
    assert.equal(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage), "Death");
    await JumpStage(17);
    await WaitStage("FinalDefense", 45);
    await JumpStage(18);
    assert.equal(
      await page.evaluate(
        () => window.Tengxian.Debug.FirstLevelMission().column.litters.find((l) => l.zhou).health,
      ),
      0,
    );
    await Route(
      Routes.exit.slice(1,3),
      "FinalDefensePosition",
      { fight: true },
    );
    // Actually leave the rear gate, as Luo orders. Stopping at x=-40 inside
    // the west wall cannot expose a surviving flanker outside that wall.
    await Route(Routes.exit.slice(2,5),"RearLaneRearguard",{fight:true});
    await WaitStage("Exit", 160, { fight: true });
    await Route(
      Routes.exit.slice(2),
      "PersonalExit",
      { fight: true },
    );
    await WaitStage("Complete", 60);
    assert.ok(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().voice.finished.includes("FinalExit")),"final handoff dialogue finishes before completion");
    assert.equal(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage), "Complete");
    if (!stageJumps) {
    const pacing = await page.evaluate(() => {
      const stages = window.Tengxian.Debug.FirstLevelMission().log.filter((e) => e.kind === "stage");
      return Object.fromEntries(stages.slice(0, -1).map((e, i) => [e.id, stages[i + 1].time - e.time]));
    });
    console.log("pacing", JSON.stringify(pacing));
    assert.ok(
      pacing.South >= 6 && pacing.South <= 8,
      "South fade and text use the authored six-second transition",
    );
    assert.ok(
      pacing.TransferApproach >= 30 && pacing.TransferApproach <= 60,
      "After the village, the visible second hope lasts 30–60 seconds",
    );
    assert.ok(
      pacing.Transfer >= 120 && pacing.Transfer <= 240,
      "Physical transfer fits the authored 2–4 minutes",
    );
    assert.ok(
      await page.evaluate(()=>{const log=window.Tengxian.Debug.FirstLevelMission().log;
        const duration=log.find(e=>e.id==="deathSceneComplete").time-log.find(e=>e.id==="deathMedicArrived").time;
        return duration>=8&&duration<=12.1;}),
      "The limited-control death scene lasts 8–12 seconds",
    );
    }
    assert.deepEqual(errors, []);
    if (stageJumps) {
      assert.deepEqual(jumpReceipts.map(receipt=>receipt.number),Array.from({length:19-stageFrom},(_,i)=>i+stageFrom));
      await fs.writeFile(path.join(output,"Data_JumpContinuation.json"),JSON.stringify(jumpReceipts,null,2));
      console.log(`ok debug starts ${stageFrom}–18 continued with real player input through their next stage, ending at Complete`);
    } else console.log("ok entire first level completed with real player input and physical mission events");
  }
} catch (error) {
  await page.evaluate(()=>window.Tengxian?.Debug.FirstLevelMission()).then(state=>fs.writeFile(path.join(output,"Data_Failure.json"),JSON.stringify(state,null,2))).catch(()=>{});
  await page.screenshot({ path: path.join(output, "Scene_Failure.png") }).catch(() => {});
  console.error(
    await page
      .evaluate(() => ({
        boot: document.querySelector("#bootText")?.textContent,
        body: document.body.innerText.slice(-1800),
      }))
      .catch(() => null),
  );
  throw error;
} finally {
  // Partial-route fixtures and failed runs need the same recovery receipts as
  // complete campaigns; a stage-only success must never masquerade as Complete.
  await fs.writeFile(path.join(output,"Data_NormalCheckpointRetries.json"),JSON.stringify(campaignRetries,null,2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
