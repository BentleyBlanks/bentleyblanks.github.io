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
const stageFrom = Number(process.argv.find(arg=>arg.startsWith("--stage-from="))?.split("=")[1] || 1);
assert.ok(stageFrom===1 || (stageJumps && [12,16].includes(stageFrom)),"supported continuation suites start at 1, 12 or 16");
const output = path.join(here, "_shots", stageFrom===12 ? "FirstLevelStageTransfer" : stageFrom===16 ? "FirstLevelStageTail" : stageJumps ? "FirstLevelStageContinue" : "FirstLevelMission");
const jumpReceipts = [];
async function JumpStage(number) {
  if (!stageJumps) return;
  const receipt = await page.evaluate(async number => {
    const g=window.Tengxian, before=g.Debug.FirstLevelMission();
    const after=await g.Debug.FirstLevelJump(number);
    // Test driver memory belongs to the old actors, just like the old runtime.
    if(window.MissionInputDriver){window.MissionInputDriver.blocked.clear();window.MissionInputDriver.lastTarget=null;window.MissionInputDriver.observedShot=0;}
    if(number===7)window.villageBodies=g.ai.soldiers.filter(a=>["VillageGunner","VillageCorner","KitchenGuard","RearWindow","SideYard","MeleeTutor"].includes(a.missionId)).map(a=>({id:a.id,missionId:a.missionId}));
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
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

async function Route(points, label, { fight = false, stance = "stand", sprint = false } = {}) {
  await page.evaluate(
    ({ points, stance, sprint }) => {
      const g = window.Tengxian;
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
    { points, stance, sprint },
  );
  let result, retries = 0;
  for (let chunk = 0; chunk < 90; chunk++) {
    result = await page.evaluate((fight) => {
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
        const foe = fight ? window.MissionInputDriver.Target() : null;
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
      b.stalled =
        Math.hypot(g.player.position.x - b.last.x, g.player.position.z - b.last.z) < 0.2 ? b.stalled + 1 : 0;
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
        stage: g.Debug.FirstLevelMissionRuntime().flow.stage.id,
        stalled: b.stalled,
        shots: g.state.playerShots,
        ammo: g.state.ammo,
        clips: g.state.clips,
        lastShot: g.state.lastShot,
        foe: window.MissionInputDriver?.Target()?.missionId,
      };
    }, fight);
    if (chunk % 4 === 0 || result.done || !result.alive) console.log(label, JSON.stringify(result));
    if (result.done || result.stalled >= 3) break;
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
      await page.evaluate(({ stance, sprint }) => {
        const g = window.Tengxian;
        g.Debug.MenuAct("retrySandbox");
        g.StepFrames(1, 1 / 60, false);
        // Re-establish the stance and sprint the leg asked for, and re-seed the
        // stall detector: the retry teleports the body to the checkpoint.
        if (g.player.stance !== stance)
          g.Debug.Key(stance === "crouch" ? "KeyC" : stance === "prone" ? "KeyZ"
            : g.player.stance === "crouch" ? "KeyC" : "KeyZ");
        g.Debug.Key("ShiftLeft", sprint);
        const b = window.routeBot;
        b.stalled = 0; b.last = { ...g.player.position };
      }, { stance, sprint });
    }
  }
  await page.evaluate(() => window.Tengxian.Debug.Key("ShiftLeft", false));
  await Capture(label);
  assert.ok(result.alive, `${label}: player alive (spent ${retries}/${ROUTE_RETRY_BUDGET} checkpoint retries)`);
  assert.ok(result.done, `${label}: actual body reached route end`);
  return result;
}
async function Interact() {
  return page.evaluate(() => {
    const g = window.Tengxian,
      query = g.Debug.Interact();
    const interaction=g.interact.Query(g.player);
    if(interaction?.point?.tag==="FirstLevelMission"){
      g.StepFrames(1,1/60,true);
      const prompt=g.hud.actionPrompts.find(p=>p.label===interaction.label);
      if(!prompt?.text||!document.querySelector(".actionText")?.textContent)throw Error("mission interaction needs a visible action label");
    }
    g.Debug.Key("KeyF", true);
    g.StepFrames(90, 1 / 60, false);
    g.Debug.Key("KeyF", false);
    return query;
  });
}
async function WaitStage(expected, seconds = 240, { fight = false } = {}) {
  // Read only the step id in the per-frame loop. Full State clones the entire
  // casualty/transport ledger; keep that diagnostic snapshot at chunk boundaries.
  let state;
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk++) {
    state = await page.evaluate(
      ({ expected, fight }) => {
        const g = window.Tengxian;
        for (let i = 0; i < 300 && g.player.alive && g.Debug.FirstLevelMissionRuntime().flow.stage.id !== expected; i++) {
          const evading=window.MissionInputDriver.EvadeGrenade();
          const foe = fight&&!evading ? window.MissionInputDriver.Target() : null;
          if (foe) window.MissionInputDriver.Shoot(foe);
          else if(!evading) {
            g.Debug.Mouse(0, false);
            g.Debug.Mouse(2, false);
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
      { expected, fight },
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
      const beds=['trainInterior','carriageCrowd'].map(id=>{
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
    await page.evaluate(() => {
      const g = window.Tengxian;
      window.MissionInputDriver = {
        blocked: new Map(),
        EvadeGrenade() {
          const p=g.player,threat=g.combat.GrenadeThreats(p.position)[0];
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
        Target() {
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
                a.missionId !== "MeleeTutor" &&
                !a.scriptedNoncombatant &&
                (this.blocked.get(a.id)||0) < g.ai.time &&
                a.position.distanceTo(eye) < 90,
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
          this.lastTarget=foe.id;
          g.Debug.Mouse(0, false);
          if (g.state.activeSlot !== "primary") g.Debug.Key("Digit1");
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
    }else await PlayFirstLevelOpening(page,{out:path.join(output,"Opening"),audioClock:audioCheck,mount:false});
    await page.evaluate(()=>{window.villageBodies=window.Tengxian.ai.soldiers.filter(a=>["VillageGunner","VillageCorner","KitchenGuard","RearWindow","SideYard","MeleeTutor"].includes(a.missionId)).map(a=>({id:a.id,missionId:a.missionId}));});
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
              to.y += a.stance === 2 ? 0.3 : a.stance === 1 ? 0.85 : 1.2;
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
                (target.stance === 2 ? 0.3 : target.stance === 1 ? 0.85 : 1.2) -
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
    const evacSpacing=await page.evaluate(()=>{const g=window.Tengxian,ids=new Set(g.Debug.FirstLevelMission().guards.filter(a=>a.safe&&a.alive).map(a=>a.id));const a=g.ai.soldiers.filter(a=>ids.has(a.id));return a.flatMap((p,i)=>a.slice(i+1).map(q=>Math.hypot(p.position.x-q.position.x,p.position.z-q.position.z)));});
    assert.ok(evacSpacing.every(d=>d>.8),"withdrawn soldiers do not occupy the same stopping point");
    await page.evaluate(() => {
      const g = window.Tengxian;
      g.Debug.Key("KeyF");
      g.Debug.Key("KeyB");
    });
    await JumpStage(5);
    await Route([{x:0,z:-124},{x:-2.2,z:-122.5}],"FrontResupply",{stance:"crouch"});
    // The expanded battle may have used this box just before the handover.
    // Wait its real cooldown in cover before testing another physical refill.
    await page.evaluate(seconds=>window.Tengxian.StepFrames(Math.ceil(seconds*60),1/60,false),R.supplyCooldownS+1);
    const reserveBefore=await page.evaluate(()=>window.Tengxian.emplacement.Emplacement("MissionGun").belts);
    await Interact();
    const reserveAfter=await page.evaluate(()=>window.Tengxian.emplacement.Emplacement("MissionGun").belts);
    assert.ok(reserveAfter>reserveBefore,"front box physically replenishes machine-gun reserve");
    await Route(
      [
        { x: 0, z: -124 },
        { x: 6, z: -124 },
        { x: 15, z: -111 },
        { x: 13, z: -116.5 },
      ],
      "BundleSupply",
      { stance: "crouch" },
    );
    console.log("bundle interaction", await Interact());
    const fullBundleCount=await page.evaluate(()=>window.Tengxian.state.bundles);
    await Interact();
    assert.equal(await page.evaluate(()=>window.Tengxian.state.bundles),fullBundleCount,"repeated pickup never adds beyond the crate reserve");
    const spentBundles=await page.evaluate(()=>{
      const g=window.Tengxian;g.player.yaw=-Math.PI/2;g.player.pitch=.55;
      for(let i=0;i<2;i++){g.Debug.Key("KeyH",true);g.StepFrames(24,1/60,false);g.Debug.Key("KeyH",false);g.StepFrames(420,1/60,false);}
      return {count:g.state.bundles,mission:g.Debug.FirstLevelMission(),alive:g.player.alive};
    });
    assert.ok(spentBundles.alive&&spentBundles.count===0&&!spentBundles.mission.tank.immobilized,"two missed real throws leave the tank objective active");
    await Interact();
    assert.equal(await page.evaluate(()=>window.Tengxian.state.bundles),fullBundleCount,"an empty player can physically return to the same crate and retry");
    console.log("ok full inventory, two missed throws, empty inventory and actual resupply recovery");
    await Route(
      [
        { x: 15, z: -111 },
        { x: 25, z: -110 },
        { x: 30, z: -117 },
      ],
      "TankFlank",
      { stance: "crouch" },
    );
    await page.evaluate(() => {
      const g = window.Tengxian;
      for (let i = 0; i < 3600 && g.Debug.FirstLevelMission().tank.z < -124; i++)
        g.StepFrames(1, 1 / 60, false);
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      if(attempt>0)await Route([{x:15,z:-111},{x:25,z:-110},{x:30,z:-117}],"TankFlankRetry",{stance:"crouch"});
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
      if (thrown.mission.tank.immobilized) break;
    }
    await WaitStage("Orders", 20);
    await JumpStage(6);
    await Route(
      [
        { x: 15, z: -111 },
        { x: 6, z: -124 },
        { x: -8, z: -112 },
        { x: -8, z: -102 },
      ],
      "EscortOrders",
      { stance: "stand", sprint:true },
    );
    const ordersSupply=await Interact();
    assert.ok(ordersSupply.kind==="supply","covered orders position offers an actual supply interaction");
    await page.evaluate(()=>{const g=window.Tengxian;g.Debug.Key("KeyB");if(g.player.stance!=="crouch")g.Debug.Key("KeyC");g.StepFrames(1,1/60,false);});
    await WaitStage("South", 240);
    await JumpStage(7);
    await Route(
      [
        { x: -8, z: -78 },
        { x: -24, z: -60 },
        { x: -24, z: -18 },
        { x: 0, z: 0 },
        { x: 24, z: -20 },
        { x: 48, z: -20 },
      ],
      "SouthRoad",
      { stance: "stand" },
    );
    await WaitStage("Village", 120);
    const withdrawnSquad=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().squad.map(a=>({id:a.castId,alive:a.alive,x:a.position.x,z:a.position.z})));
    console.log("withdrawn squad",JSON.stringify(withdrawnSquad));
    assert.ok(withdrawnSquad.length===4&&withdrawnSquad.every(a=>a.alive&&a.z>-65),"all four companions leave the front trench and follow the southbound column");
    if(process.argv.includes("--through-south")){await Capture("OpeningSquadWithdrawal");console.log("PASS normal opening, gun, tank and four-companion withdrawal");break campaignRun;}
    assert.ok(await page.evaluate(()=>window.villageBodies.every(b=>window.Tengxian.ai.soldiers.some(a=>a.id===b.id&&a.missionId===b.missionId))),"the village reuses its pre-positioned soldiers");
    await JumpStage(8);
    await Route(
      [
        { x: 58, z: -20 },
        { x: 58, z: -9 },
        { x: 58, z: 4.6 },
      ],
      "VillageKitchen",
      { fight: true },
    );
    const kitchenSquad=await page.evaluate(()=>{const g=window.Tengxian;return g.ai.soldiers.filter(a=>["luo","yaowa","heyoutian","liuwencai"].includes(a.castId)).map(a=>({id:a.castId,distance:a.position.distanceTo(g.player.position),alive:a.alive}));});
    console.log("kitchen squad",JSON.stringify(kitchenSquad));
    assert.ok(kitchenSquad.filter(a=>a.alive&&a.distance<25).length>=2,"at least two squadmates provide nearby kitchen support after the continuous march");
    assert.ok(kitchenSquad.filter(a=>a.alive).every(a=>a.distance<45),"no living squadmate remains abandoned at the front during village support");
    await JumpStage(9);
    const melee = await page.evaluate(() => {
      const g = window.Tengxian,
        enemy = g.ai.soldiers.find((a) => a.missionId === "MeleeTutor");
      const wasAlive = enemy.alive;
      g.Debug.Key("KeyV");
      let sawQte = false,
        windowS = null;
      for (let frame = 0; frame < 60 * 40 && g.player.Alive && enemy.alive; frame++) {
        const distance = enemy.position.distanceTo(g.player.position),
          fighter = g.meleeCombat.Fighter(g.player);
        const yaw = Math.atan2(
          g.player.position.x - enemy.position.x,
          g.player.position.z - enemy.position.z,
        );
        const gap = Math.atan2(Math.sin(yaw - g.player.yaw), Math.cos(yaw - g.player.yaw));
        g.player.yaw += Math.max(-0.06, Math.min(0.06, gap));
        g.player.pitch = 0;
        // The shared bind contact is 1.15 m; keep approaching until actually inside it.
        // Stopping at 1.22 m made this check depend on the opponent closing the last gap.
        g.Debug.Key("KeyW", !g.meleeCombat.Active && distance > 1.03);
        if (g.meleeCombat.Active) {
          sawQte = true;
          windowS = g.meleeCombat.qte.active.windowS;
          if (frame % 12 === 0) {
            g.Debug.Key("KeyF", true);
            g.Debug.Key("KeyF", false);
          }
        } else if (fighter.state === "idle") {
          const foe = g.meleeCombat.Fighter(enemy);
          if (
            foe.attack &&
            foe.t > foe.attack.windup - 0.13 &&
            foe.t < foe.attack.windup &&
            distance < foe.attack.reach
          ) {
            g.Debug.Mouse(2, true);
            g.Debug.Mouse(2, false);
          } else if (distance < 1.5 && sawQte) {
            g.Debug.Mouse(0, true);
            g.Debug.Mouse(0, false);
          }
        }
        g.StepFrames(1, 1 / 60, false);
      }
      g.Debug.Key("KeyW", false);
      g.Debug.Mouse(0, false);
      g.Debug.Mouse(2, false);
      return {
        wasAlive,
        sawQte,
        windowS,
        enemyAlive: enemy.alive,
        alive: g.player.Alive,
        health: g.player.health,
        events: g.meleeCombat.State().events,
      };
    });
    console.log("melee", JSON.stringify(melee));
    await Capture("MeleeResult");
    assert.ok(
      melee.wasAlive && melee.alive && !melee.enemyAlive,
      "The authored close encounter is playable with V, movement, parry and real blade contact",
    );
    assert.ok(
      melee.sawQte && melee.windowS >= 2 && melee.windowS <= 3,
      "Facing the bayonet soldier and closing to real weapon contact starts the authored 2–3 second struggle",
    );
    await page.evaluate(() => window.Tengxian.Debug.Key("Digit1"));
    await WaitStage("Courtyard", 90, { fight: true });
    await JumpStage(10);
    if(stageJumps) {
      // The normal approach already killed this gunner. A standalone court
      // start deliberately keeps that current objective alive: use the same
      // real kitchen approach to get a firing angle before opening the gate.
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
    await Route([{ x: 95, z: 110 }], "TransferSupply", { fight: true });
    await Interact();
    await Route([{ x: 95, z: 103 }], "TransferPosition", { fight: true });
    await WaitStage("AirFirst", 300, { fight: true });
    const transferPacing=await page.evaluate(()=>{const m=window.Tengxian.Debug.FirstLevelMission();return {beats:m.transferBeats,events:m.log.filter(e=>/AttackStarted|AttackCleared|vehiclesDeparted|zhouNext/.test(e.id)),entered:m.log.find(e=>e.kind==="stage" && e.id==="Transfer")?.time,ended:m.time};});
    assert.deepEqual(transferPacing.beats.started,MISSION_TRANSFER_BEATS.map(beat=>beat.id));
    assert.deepEqual(transferPacing.beats.cleared,MISSION_TRANSFER_BEATS.map(beat=>beat.id),"all finite attacks actually resolve before the air raid");
    await fs.writeFile(path.join(output,"Data_TransferPacing.json"),JSON.stringify(transferPacing,null,2));
    console.log("transfer pacing",JSON.stringify(transferPacing));
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
      [
        { x: 39, z: 116 },
        { x: 18, z: 109 },
      ],
      "FirstRearguard",
      { fight: true, stance: "stand" },
    );
    await WaitStage("RetreatWall", 240, { fight: true });
    await Route(
      [
        { x: -7, z: 98 },
        { x: -28, z: 88 },
        { x: -51, z: 82 },
      ],
      "WallRearguard",
      { fight: true },
    );
    await Interact();
    await WaitStage("RetreatYard", 180, { fight: true });
    await Route(
      [
        { x: -67, z: 64 },
        { x: -84, z: 61 },
        { x: -99, z: 42 },
      ],
      "YardRearguard",
      { fight: true },
    );
    await WaitStage("Reception", 180, { fight: true });
    const retreatEncounters=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().enemies.map(actor=>actor.id));
    for(const spec of [...MISSION_ENCOUNTERS.retreatWall,...MISSION_ENCOUNTERS.retreatYard])assert.ok(retreatEncounters.includes(spec.id),"the withdrawal has both authored flank encounters: "+spec.id);
    }
    await JumpStage(16);
    await Route(
      [
        { x: -120, z: 40 },
        { x: -138, z: 40 },
        { x: -138, z: 49 },
        { x: -138, z: 45 },
      ],
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
      [
        { x: -142, z: 49 },
        { x: -151, z: 49 },
        { x: -151, z: 42.8 },
      ],
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
      [
        { x: -151, z: 47 },
        { x: -147, z: 49 },
        { x: -147, z: 54 },
      ],
      "FinalDefensePosition",
      { fight: true },
    );
    await Route([{x:-172,z:54}],"RearLaneRearguard",{fight:true});
    await WaitStage("Exit", 160, { fight: true });
    await Route(
      [
        { x: -172, z: 54 },
        { x: -174, z: 29 },
        { x: -187, z: 20 },
        { x: -187, z: 12 },
        { x: -186, z: -8 },
      ],
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
      pacing.South >= 60 && pacing.South <= 120,
      "Calm southbound travel fits the authored 1–2 minutes",
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
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
