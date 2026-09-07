// Real browser baseline and campaign input driver; screenshots stay local.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { SCENE_RENDER_LIMITS } from "./Data_AssetStandards.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, "..");
const output = path.join(here, "_shots", "FirstLevelMission");
const audioCheck = process.argv.includes("--audio");
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
    info.autoReset = reset;
    return result;
  });
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
        cast: window.Tengxian.ai.soldiers
          .filter((a) => a.castId)
          .map((a) => ({
            id: a.castId,
            position: { ...a.position },
            goal: { ...a.goal },
            stance: a.stance,
            unloaded: a.missionUnloaded,
            exitIndex: a.missionExitIndex,
          })),
      })),
      null,
      2,
    ),
  );
}
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
  let result;
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
          (g.Debug.FirstLevelMission().complete &&
            Math.hypot(g.player.position.x - b.points.at(-1).x, g.player.position.z - b.points.at(-1).z) < 5),
        index: b.index,
        target: b.points[b.index],
        position: { ...g.player.position },
        alive: g.player.alive,
        health: g.player.health,
        stage: g.Debug.FirstLevelMission().stage,
        stalled: b.stalled,
        shots: g.state.playerShots,
        ammo: g.state.ammo,
        clips: g.state.clips,
        lastShot: g.state.lastShot,
        foe: window.MissionInputDriver?.Target()?.missionId,
      };
    }, fight);
    if (chunk % 4 === 0 || result.done || !result.alive) console.log(label, JSON.stringify(result));
    if (result.done || !result.alive || result.stalled >= 3) break;
  }
  await page.evaluate(() => window.Tengxian.Debug.Key("ShiftLeft", false));
  await Capture(label);
  assert.ok(result.alive, `${label}: player alive`);
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
  let state;
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk++) {
    state = await page.evaluate(
      ({ expected, fight }) => {
        const g = window.Tengxian;
        for (let i = 0; i < 300 && g.player.alive && g.Debug.FirstLevelMission().stage !== expected; i++) {
          const foe = fight ? window.MissionInputDriver.Target() : null;
          if (foe) window.MissionInputDriver.Shoot(foe);
          else {
            g.Debug.Mouse(0, false);
            g.Debug.Mouse(2, false);
          }
          if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
          g.StepFrames(1, 1 / 60, false);
        }
        g.Debug.Mouse(0, false);
        g.Debug.Mouse(2, false);
        return { mission: g.Debug.FirstLevelMission(), health: g.player.health, alive: g.player.alive };
      },
      { expected, fight },
    );
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
  }
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
  assert.deepEqual(initial.mission.train.counts, [8, 24, 8]);
  assert.equal(initial.mission.train.entries.length, 41, "40 recruits plus Luo, player separate");
  const ride = await page.evaluate(() => {
    const g = window.Tengxian;
    const playerStart={x:g.player.position.x,z:g.player.position.z-g.battlefield.trainOffsetM,y:g.player.position.y,yaw:g.player.yaw};
    g.Debug.Key("KeyW",true);g.Debug.Key("KeyD",true);g.Debug.Key("ShiftLeft",true);
    for(const key of ["Space","KeyC","KeyZ"])g.Debug.Key(key);
    g.Debug.Look(70,-12);g.StepFrames(1,1/60,true);
    const canLook=Math.abs(g.player.yaw-playerStart.yaw)>.02;
    g.Debug.Look(-70,12);g.StepFrames(119,1/60,true);
    const actors = g.ai.soldiers.filter(a => a.missionTrainPassenger);
    const BoneLocal = (a, role) => a.actor.root.worldToLocal(a.actor.characterRig.bones[role].getWorldPosition(a.position.clone()));
    const start = actors.map(a => ({x:a.position.x, z:a.position.z-g.battlefield.trainOffsetM,
      hand:BoneLocal(a,'handR'),feet:['footL','footR'].map(role=>BoneLocal(a,role))}));
    const life = actors.map(a=>({kind:a.missionTrainLife.kind,seated:a.missionTrainLife.seated,active:a.actor.characterRig.missionTrainLifeActive,
      pelvis:BoneLocal(a,'pelvis').y, poseTime:a.actor.characterRig.missionTrainLifeState.time, animatedSeconds:0, handTravel:0, footDrift:0}));
    let maxLocalDrift=0, maxAnimationSpeed=0, maxRootError=0, playerDrift=0, playerRise=0;
    const offsetBefore=g.battlefield.trainOffsetM;
    const poses=actors.map(a=>({clip:a.actor.characterRig?.currentPlaybackId,rate:a.actor.characterRig?.currentAction?.getEffectiveTimeScale()}));
    for(let frame=0;frame<480;frame++) {
      g.StepFrames(1,1/60,true);
      playerDrift=Math.max(playerDrift,Math.hypot(g.player.position.x-playerStart.x,g.player.position.z-g.battlefield.trainOffsetM-playerStart.z));
      playerRise=Math.max(playerRise,Math.abs(g.player.position.y-playerStart.y));
      actors.forEach((a,i)=>{
        maxLocalDrift=Math.max(maxLocalDrift,Math.hypot(a.position.x-start[i].x,a.position.z-g.battlefield.trainOffsetM-start[i].z));
        maxAnimationSpeed=Math.max(maxAnimationSpeed,a.actor.characterRig?.p012ActualSpeedMps||0);
        maxRootError=Math.max(maxRootError,a.actor.root.position.distanceTo(a.position));
        life[i].animatedSeconds=a.actor.characterRig.missionTrainLifeState.time-life[i].poseTime;
        life[i].handTravel=Math.max(life[i].handTravel,BoneLocal(a,'handR').distanceTo(start[i].hand));
        for(const [j,role] of ['footL','footR'].entries())life[i].footDrift=Math.max(life[i].footDrift,BoneLocal(a,role).distanceTo(start[i].feet[j]));
      });
    }
    for(const key of ["KeyW","KeyD","ShiftLeft"])g.Debug.Key(key,false);
    return {count:actors.length,travel:offsetBefore-g.battlefield.trainOffsetM,maxLocalDrift,maxAnimationSpeed,maxRootError,poses,life,
      handoff:{canLook,playerDrift,playerRise,stance:g.player.stance,locked:g.Debug.FirstLevelMission().receivingFood}};
  });
  console.log("TRAIN_RIDE",JSON.stringify(ride));
  assert.ok(ride.handoff.canLook&&ride.handoff.playerDrift<.04&&ride.handoff.playerRise<.08&&ride.handoff.stance==="stand"&&ride.handoff.locked,
    "receiving food holds walking, sprinting, jumping and stance, while retaining free look: "+JSON.stringify(ride.handoff));
  assert.ok(ride.poses.every(p=>p.clip==="AttackCommand"&&p.rate===0), "the sampled base pose never treats train travel as walking");
  assert.ok(ride.travel>1 && ride.maxLocalDrift<.08 && ride.maxAnimationSpeed<.05 && ride.maxRootError<.08, "train-local bodies and rendered roots stay still without a walking cycle: "+JSON.stringify(ride));
  assert.equal(ride.life.filter(p=>p.seated).length,32,'32 actual side-bench seats, eight standing recruits and Luo');
  assert.ok(ride.life.every(p=>p.active && p.footDrift<.025),'procedural upper-body activity keeps boot contacts fixed');
  assert.ok(ride.life.filter(p=>p.seated).every(p=>Math.abs(p.pelvis-.6)<.025),'seated pelvis rests over the bench');
  assert.ok(new Set(ride.life.map(p=>p.kind)).size>=7,'distinct carriage activities');
  const gestureKinds=['ShareFood','Eat','Talk','CountAmmo','Gear'];
  // The existing visibility budget intentionally stops evaluating off-screen rigs.
  // Every fully observed gesture must move; each activity also needs a visible witness.
  assert.ok(ride.life.filter(p=>gestureKinds.includes(p.kind)&&p.animatedSeconds>7).every(p=>p.handTravel>.012),'visible hands perform their activity rather than freezing');
  for(const kind of gestureKinds)assert.ok(ride.life.some(p=>p.kind===kind&&p.handTravel>.025),'visible gesture witness: '+kind);
  await Capture("Train");
  const pause = await page.evaluate(() => {
    const g = window.Tengxian;
    g.Debug.Pause();
    const Snapshot = () =>
      JSON.stringify({
        time: g.Debug.FirstLevelMission().time,
        positions: g.ai.soldiers.map((a) => a.position.toArray()),
        column: g.Debug.FirstLevelMission().column,
      });
    const before = Snapshot();
    g.StepFrames(300, 1 / 60, false);
    const frozen = before === Snapshot();
    const locked=g.Debug.FirstLevelMission().receivingFood;
    g.Debug.MenuAct("resume");
    return { frozen, running: g.state.running, locked };
  });
  assert.ok(pause.frozen && pause.running && pause.locked, "Pause freezes the world and resume restores input");
  const opening = await page.evaluate(() => {
    const g=window.Tengxian;
    const ammo=g.state.ammo,shots=g.state.playerShots,bundles=g.state.bundles,grenades=g.state.grenades;
    g.Debug.Mouse(0,true);g.Debug.Mouse(2,true);
    for(const key of ["KeyR","KeyV","KeyG","KeyH","Digit2"])g.Debug.Key(key);
    g.StepFrames(30,1/60,true);
    g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
    const released=!g.Debug.FirstLevelMission().receivingFood, xBefore=g.player.position.x;
    g.Debug.Key("KeyA",true);g.StepFrames(18,1/60,true);g.Debug.Key("KeyA",false);
    const walkAfter=Math.abs(g.player.position.x-xBefore);
    g.Debug.Key("KeyD",true);g.StepFrames(18,1/60,true);g.Debug.Key("KeyD",false);
    const empty={hidden:!g.viewmodel.root.visible,ammo:g.state.ammo===ammo,shots:g.state.playerShots===shots,
      grenades:g.state.grenades===grenades,bundles:g.state.bundles===bundles,ads:g.player.ads};
    for(let i=0;i<120*60&&!g.Debug.FirstLevelMission().facts.includes("trainProneOrder");i++)g.StepFrames(1,1/60,false);
    const before=g.Debug.FirstLevelMission();
    const prompt=before.openingPrompt;
    const stanceBefore=g.player.stance;
    g.Debug.Key("KeyZ");
    g.StepFrames(60,1/60,true);
    const after=g.Debug.FirstLevelMission();
    const prone={prompt,stanceBefore,stanceAfter:g.player.stance,ack:after.facts.includes("trainPlayerProne"),
      promptCleared:!after.openingPrompt};
    for(let i=0;i<120*60&&!g.Debug.FirstLevelMission().facts.includes("unloadOrdersHeard");i++)g.StepFrames(1,1/60,false);
    return {empty,prone,released,walkAfter,after:g.Debug.FirstLevelMission()};
  });
  assert.ok(opening.empty.hidden&&opening.empty.ammo&&opening.empty.shots&&opening.empty.grenades&&opening.empty.bundles&&opening.empty.ads<.01,
    "empty hands also blocks all weapon actions: "+JSON.stringify(opening.empty));
  assert.ok(opening.released&&opening.walkAfter>.1,"walking resumes after the completed receiving reply");
  assert.equal(opening.prone.prompt?.keys,"Z");
  assert.notEqual(opening.prone.stanceBefore,"prone","the mission never forces the player prone");
  assert.ok(opening.prone.stanceAfter==="prone"&&opening.prone.ack&&opening.prone.promptCleared);
  const firstHit=opening.after.log.find(x=>x.id==="trainFirstShellImpact")?.time;
  const injury=opening.after.log.find(x=>x.id==="trainSoldierWounded")?.time;
  const proneOrder=opening.after.log.find(x=>x.id==="trainProneOrder")?.time;
  assert.ok(firstHit<proneOrder&&proneOrder<injury,"surprise impact, immediate cover order, then the second hit and injury");
  const stoppedAt=opening.after.log.find(x=>x.id==="trainStopped").time;
  const unloadOrderAt=opening.after.log.find(x=>x.id==="unloadOrdersHeard").time;
  assert.ok(stoppedAt>firstHit&&unloadOrderAt>stoppedAt,"physical emergency stop precedes the completed unload order");
  await fs.writeFile(path.join(output,"Data_OpeningInteraction.json"),JSON.stringify(opening,null,2));

  await page.evaluate(() => window.Tengxian.StepFrames(1, 1 / 60, true));
  const unloaded = await page.evaluate(() => ({
    mission: window.Tengxian.Debug.FirstLevelMission(),
    position: { ...window.Tengxian.player.position },
  }));
  assert.equal(unloaded.mission.stage, "Unloading");
  assert.ok(unloaded.mission.facts.includes("trainStopped"));
  assert.ok(unloaded.mission.voice.finished.includes("TrainMeal"),"the opening exchange finishes before shelling interrupts it");
  // Deliberate lethal-damage fixture tests the new runtime retry; it does not grant any mission facts.
  const retry = await page.evaluate(() => {
    const g = window.Tengxian,
      before = g.Debug.FirstLevelMission(),
      ammo = g.state.ammo;
    g.player.TakeHit(10000, "torso");
    g.StepFrames(1, 1 / 60, false);
    const failed = g.Debug.FirstLevelMission().failed && !g.player.Alive;
    const time = g.Debug.FirstLevelMission().time;
    g.StepFrames(300, 1 / 60, false);
    const frozen = g.Debug.FirstLevelMission().time === time;
    g.Debug.MenuAct("retrySandbox");
    g.StepFrames(1, 1 / 60, false);
    return {
      failed,
      frozen,
      alive: g.player.Alive,
      running: g.state.running,
      stage: g.Debug.FirstLevelMission().stage,
      facts: g.Debug.FirstLevelMission().facts,
      beforeFacts: before.facts,
      ammo: g.state.ammo,
      beforeAmmo: ammo,
      position: { ...g.player.position },
    };
  });
  assert.ok(retry.failed && retry.frozen && retry.alive && retry.running);
  assert.equal(retry.stage, "Unloading");
  assert.deepEqual(retry.facts, retry.beforeFacts);
  assert.equal(retry.ammo, retry.beforeAmmo);
  assert.ok(Math.abs(retry.position.z - MISSION_TRAIN.player.z) < 1, "Train checkpoint follows the same carriage as it moves");
  const menuCheckpoint = await page.evaluate(() => {
    const g = window.Tengxian,
      before = g.Debug.FirstLevelMission(),
      ammo = g.state.ammo;
    const actors = JSON.stringify(g.ai.soldiers.map((a) => a.position.toArray()));
    g.Debug.Pause();
    g.Debug.MenuAct("debug");
    const action = document.querySelector('[data-action="continueCheckpoint"]');
    const enabled = !!action && !action.disabled;
    action?.click();
    return {
      enabled,
      running: g.state.running,
      closed: !g.menu.open,
      alive: g.player.Alive,
      unchanged:
        JSON.stringify(g.Debug.FirstLevelMission().facts) === JSON.stringify(before.facts) &&
        g.state.ammo === ammo &&
        JSON.stringify(g.ai.soldiers.map((a) => a.position.toArray())) === actors,
    };
  });
  assert.ok(
    menuCheckpoint.enabled &&
      menuCheckpoint.running &&
      menuCheckpoint.closed &&
      menuCheckpoint.alive &&
      menuCheckpoint.unchanged,
    "The visible current-checkpoint menu resumes this mission without moving actors or granting facts",
  );
  await fs.writeFile(
    path.join(output, "Data_Initial.json"),
    JSON.stringify({ initial, unloaded, errors }, null, 2),
  );
  await page.screenshot({ path: path.join(output, "Scene_Unloading.png") });
  assert.deepEqual(errors, []);
  console.log("ok moving train, shelling and stop; output", output);
  await Route([{x:-73,z:MISSION_TRAIN.player.z},{x:-71,z:MISSION_TRAIN.player.z},{x:-71,z:110}], "TrainExitApron");
  for(let i=0;i<30;i++) {
    const train=await page.evaluate(()=>{window.Tengxian.StepFrames(300,1/60,false);return window.Tengxian.Debug.FirstLevelMission().train;});
    if(train.entries.every(e=>e.arrived))break;
  }
  const trainExit=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().train);
  await Capture("TrainAllDisembarked");
  await fs.writeFile(path.join(output,"Data_TrainDisembark.json"),JSON.stringify({ride,train:trainExit},null,2));
  assert.equal(trainExit.exited,40,"all 40 original recruit bodies leave via the three real stairways");
  assert.ok(trainExit.entries.every(e=>e.life.weight===0),"every boarding pose releases before walking away");
  assert.ok(trainExit.entries.every(e=>e.arrived),"all train bodies arrive without respawning: "+JSON.stringify(trainExit.entries.filter(e=>!e.arrived)));
  console.log("ok all 40 recruits and Luo physically disembarked and reached individual muster points");
  if (process.argv.includes("--campaign")) {
    await page.evaluate(() => {
      const g = window.Tengxian;
      window.MissionInputDriver = {
        Target() {
          const eye = g.player.EyePosition;
          return g.ai.soldiers
            .filter(
              (a) =>
                a.side === "ija" &&
                a.alive &&
                a.missionId !== "MeleeTutor" &&
                a.position.distanceTo(eye) < 90,
            )
            .sort((a, b) => a.position.distanceToSquared(eye) - b.position.distanceToSquared(eye))
            .find((a) => {
              const to = a.position.clone();
              to.y += a.stance === 2 ? 0.3 : a.stance === 1 ? 0.85 : 1.2;
              const d = to.sub(eye),
                length = d.length(),
                hit = g.battlefield.Raycast(eye, d.normalize(), length);
              return !hit || hit.t >= length - 0.25;
            });
        },
        Shoot(foe) {
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
    await page.evaluate(async () => {
      const { MISSION_ROUTES } = await import("./Data_FirstLevelMissionLayout.mjs");
      window.missionBot = {
        route: [
          { x: -71, z: 74 },
          { x: -66, z: 66 },
          ...MISSION_ROUTES.support,
          { x: 0, z: -124 },
          { x: 0, z: -126.9 },
        ],
        index: 0,
        frames: 0,
        trace: [],
        battleEvidence: [],
      };
    });
    let navigation;
    for (let chunk = 0; chunk < 75; chunk++) {
      navigation = await page.evaluate(() => {
        const g = window.Tengxian,
          b = window.missionBot,
          Wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
        g.Debug.Key("KeyW", true);
        g.Debug.Key("ShiftLeft", true);
        for (let i = 0; i < 600; i++) {
          const target = b.route[b.index],
            p = g.player.position;
          if (Math.hypot(p.x - target.x, p.z - target.z) < 1.1) {
            b.index++;
            if (b.index === b.route.length) break;
          }
          const at = b.route[b.index],
            yaw = Math.atan2(p.x - at.x, p.z - at.z);
          g.player.yaw += Math.max(-0.04, Math.min(0.04, Wrap(yaw - g.player.yaw)));
          g.player.pitch = 0;
          if(g.player.bleeding && g.player.health<85)g.Debug.Key("KeyB");
          g.StepFrames(1, 1 / 60, false);
          b.frames++;
          if(b.frames%300===0){const m=g.Debug.FirstLevelMission();if(m.stage==="Support")b.battleEvidence.push({position:{...p},sound:m.battleSound,front:m.enemies.filter(e=>e.id.startsWith("Front")).length,
            squad:g.ai.soldiers.filter(a=>a.missionNaturalMarch&&a.castId).map(a=>({id:a.castId,x:a.position.x,z:a.position.z,speed:a.missionMarchSpeed||0,yaw:a.yaw,goal:{x:a.goal.x,z:a.goal.z}}))});}
          if (!g.player.alive) break;
        }
        g.Debug.Key("KeyW", false);
        g.Debug.Key("ShiftLeft", false);
        const result = {
          done: b.index === b.route.length,
          index: b.index,
          target: b.route[b.index],
          position: { ...g.player.position },
          stage: g.Debug.FirstLevelMission().stage,
          alive: g.player.alive,
          health: g.player.health,
          frames: b.frames,
        };
        b.trace.push(result);
        return result;
      });
      console.log("navigation", JSON.stringify(navigation));
      if (!navigation.alive || navigation.done) break;
      if (chunk > 4) {
        const stuck = await page.evaluate(() => {
          const a = window.missionBot.trace.slice(-3);
          return (
            a.length === 3 &&
            a.every((p) => Math.hypot(p.position.x - a[0].position.x, p.position.z - a[0].position.z) < 0.2)
          );
        });
        assert.equal(stuck, false, "Train/front approach must make physical progress");
      }
    }
    await page.evaluate(() => window.Tengxian.StepFrames(1, 1 / 60, true));
    await page.screenshot({ path: path.join(output, "Scene_Front.png") });
    await fs.writeFile(
      path.join(output, "Data_Navigation.json"),
      JSON.stringify(
        await page.evaluate(() => ({
          bot: window.missionBot,
          mission: window.Tengxian.Debug.FirstLevelMission(),
          cast: window.Tengxian.ai.soldiers
            .filter((a) => a.castId)
            .map((a) => ({
              id: a.castId,
              position: { ...a.position },
              goal: { ...a.goal },
              stance: a.stance,
              unloaded: a.missionUnloaded,
              exitIndex: a.missionExitIndex,
            })),
        })),
        null,
        2,
      ),
    );
    assert.ok(navigation.alive, "Player survives normal approach");
    assert.equal(navigation.stage, "MachineGun");
    const battlefieldSound=await page.evaluate(()=>window.missionBot.battleEvidence);
    assert.ok(battlefieldSound.length>=3&&battlefieldSound.every(e=>e.front===12),"front encounter exists along the support approach");
    assert.ok(battlefieldSound.some(e=>e.sound.recent.some(s=>s.cue==="amb.cannonFar"))&&battlefieldSound.some(e=>e.sound.recent.some(s=>s.cue==="type92")),"distant cannon and machine gun persist in the trench");
    assert.ok(battlefieldSound.some(e=>e.squad.filter(a=>a.speed>.1).length>=2 && Math.max(...e.squad.map(a=>a.speed))-Math.min(...e.squad.map(a=>a.speed))>.05),"actual squad march has independent pace");
    for(const id of ["luo","yaowa","heyoutian","liuwencai"]){
      const samples=battlefieldSound.flatMap(e=>e.squad.filter(a=>a.id===id));
      assert.ok(samples.length>=2&&samples.some(a=>Math.hypot(a.x-samples[0].x,a.z-samples[0].z)>5),id+" makes physical progress along the personal route");
    }
    await fs.writeFile(path.join(output,"Data_TrenchCombatSound.json"),JSON.stringify(battlefieldSound,null,2));
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
      for(const yaw of [0,.5,-.5]){g.player.yaw=yaw;g.player.pitch=0;g.StepFrames(6,1/60,false);
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
          b = window.missionBot;
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
          if (g.Debug.FirstLevelMission().stage !== "MachineGun" || !g.player.alive) break;
        }
        g.Debug.Mouse(0, false);
        g.Debug.Key("KeyR", false);
        return {
          stage: g.Debug.FirstLevelMission().stage,
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
          enemies: defense.mission.enemies.filter((a) => a.alive).map((a) => a.id),
        }),
      );
      if (!defense.alive || defense.stage !== "MachineGun") break;
    }
    await page.evaluate(() => window.Tengxian.StepFrames(1, 1 / 60, true));
    await page.screenshot({ path: path.join(output, "Scene_MachineGun.png") });
    await fs.writeFile(path.join(output, "Data_Defense.json"), JSON.stringify(defense, null, 2));
    assert.ok(defense.alive, "Player survives covered emplacement");
    assert.equal(defense.stage, "Tank", "Actual guards pass under player machine gun support");
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
    await Route([{x:0,z:-124},{x:-2.2,z:-122.5}],"FrontResupply",{stance:"crouch"});
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
      const thrown = await page.evaluate(() => {
        const g = window.Tengxian,
          tank = g.Debug.FirstLevelMission().tank,
          p = g.player.position;
        g.player.yaw = Math.atan2(p.x - tank.x, p.z - tank.z);
        g.player.pitch = 0.35;
        const before = g.state.bundles;
        g.Debug.Key("KeyH", true);
        g.StepFrames(24, 1 / 60, false);
        g.Debug.Key("KeyH", false);
        g.StepFrames(420, 1 / 60, false);
        return { before, after: g.state.bundles, mission: g.Debug.FirstLevelMission() };
      });
      console.log(
        "actual bundle throw",
        JSON.stringify({
          before: thrown.before,
          after: thrown.after,
          tank: thrown.mission.tank,
          explosions: thrown.mission.playerExplosions,
        }),
      );
      if (thrown.mission.tank.immobilized) break;
    }
    await WaitStage("Orders", 20);
    await Route(
      [
        { x: 25, z: -110 },
        { x: 15, z: -111 },
        { x: 6, z: -124 },
        { x: 0, z: -124 },
      ],
      "EscortOrders",
      { stance: "crouch" },
    );
    await WaitStage("South", 240);
    await Route(
      [
        { x: -8, z: -112 },
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
    await Route(
      [
        { x: 58, z: -20 },
        { x: 58, z: -9 },
        { x: 58, z: 4.6 },
      ],
      "VillageKitchen",
      { fight: true },
    );
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
        g.Debug.Key("KeyW", distance > 1.22);
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
          } else if (distance < 1.5 && (sawQte || frame > 180)) {
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
    await WaitStage("Transfer", 360, { fight: true });
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
    await Route([{ x: 95, z: 110 }], "TransferSupply", { fight: true });
    await Interact();
    await Route([{ x: 95, z: 103 }], "TransferPosition", { fight: true });
    await WaitStage("AirFirst", 300, { fight: true });
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
    await WaitStage("Rescue", 12);
    assert.equal(
      await page.evaluate(() => window.Tengxian.carry.Active),
      false,
      "Dive releases the original stretcher",
    );
    await WaitStage("RetreatFirst", 100, { fight: true });
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
    await WaitStage("FinalDefense", 45);
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
      pacing.Transfer >= 120 && pacing.Transfer <= 240,
      "Physical transfer fits the authored 2–4 minutes",
    );
    assert.ok(
      await page.evaluate(()=>{const log=window.Tengxian.Debug.FirstLevelMission().log;
        const duration=log.find(e=>e.id==="deathSceneComplete").time-log.find(e=>e.id==="deathMedicArrived").time;
        return duration>=8&&duration<=12.1;}),
      "The limited-control death scene lasts 8–12 seconds",
    );
    assert.deepEqual(errors, []);
    console.log("ok entire first level completed with real player input and physical mission events");
  }
} catch (error) {
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
