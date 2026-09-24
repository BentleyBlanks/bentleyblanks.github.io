// Scoped 01–03 normal-input acceptance (2026-09-23 draft). No stage facts or positions are injected:
// 01–02 are watched frame by frame, then the player picks up the rifle, walks out of the bunker and
// down the rear trench with ordinary input, and the front battle driver takes over at Support.
//
// What is asserted (contract docs/Data_FirstLevel0105Refactor20260923Contract.md §2.1, §5.3):
//   · every phase of OPENING_STORYBOARDS.phases really starts, in table order (director `events`);
//   · ijaA / ijaB die at the dadao contact, ijaD (junction) is really shot, all before Check;
//   · zero teleports (per-frame pelvis step), camera and first-person hands continuous;
//   · player alive through the show, health at the hand-back recorded;
//   · mouths: the speaking actor's jaw moves, listeners keep theirs closed (breathing only);
//   · the 02 withdrawal: pursuit in the trench behind us, removed with ijaC at the collection;
//   · CollectionMeet and SupportOrder play at the collection before 03.
// The non-ideal hand-back orders (Liu misses, the junction man hides, he is already dead) are
// DriveHandbackNegative below, run by Script_OpeningHandbackBrowserTest.mjs.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { FRONT_SPACE } from "./Data_FirstLevelFrontRoute.mjs";
import { OPENING_STORYBOARDS as Storyboards } from "./Data_OpeningStoryboards.mjs";

/** Listener jaw ceiling (rad): breathing only (Script_CharacterSpeechBrowserTest SILENT_JAW_RADIANS). */
export const SILENT_JAW_RADIANS = .02;
/** Speaking jaw floor (rad) a visible speaker reaches at least once while his line plays. */
export const SPEAKING_JAW_RADIANS = .06;
/** A listener is sampled only this long after his own last line (the jaw eases shut after a line). */
export const SILENT_AFTER_S = .6;
/** Pelvis travel per 1/60 s frame above which a move is a jump (9 m/s: faster than any run, pelvis sway included). */
export const STEP_LIMIT_M = .15;
/** How long the withdrawal may hold at the rear corner looking back for the pursuit (s). */
export const LOOKBACK_S = 12;
const DIRECTOR_PHASES = [...Storyboards.phases.Trapped, ...Storyboards.phases.BunkerRescue];
const RC = MISSION_STAGE_ROUTES.rearTrench[2];
const WITHDRAW_ROUTE = [...Storyboards.withdraw.lane.slice(1), ...MISSION_STAGE_ROUTES.rearTrench.slice(3)];
const AT_RC = WITHDRAW_ROUTE.findIndex((p) => p.x === RC.x && p.z === RC.z) + 1;

// Key frames (contract §7.4 K1/K2 plus the draft's beats): phase + seconds into it, or a director flag.
const KEY_FRAMES = [
  { label: "K1_Wake", phase: "Wake", age: 1.6 },
  { label: "FrontPass", phase: "FrontPass", age: 2 },
  { label: "Interrogation", phase: "Interrogation", age: 3 },
  { label: "ThroatCut", phase: "Slash", flag: "throatCut", at: .25 },
  { label: "Drag", phase: "Drag", age: 1.2 },
  { label: "Boots", phase: "Boots", age: 1 },
  // K2: from Shunzi's eye the mouth spoil hides the whole SSW leg; Luo first shows over it on the
  // crater step about 2 m away (09-24 filmstrip), just before 「说话！」.
  { label: "K2_GlimpseRise", phase: "Glimpse", age: 1.5 },
  { label: "K2_Glimpse", phase: "Glimpse", luoWithinM: 2.3 },
  { label: "LuoChop", phase: "Parry", flag: "luoChopAt", at: .5 },
  // He's parry and cut run on past Parry into Flee (Parry hands over 0.4 s after heChopAt): no phase filter.
  { label: "HeParry", flag: "heChopAt", at: .42 },
  { label: "HeChop", flag: "heChopAt", at: .8 },
  { label: "DragCover", phase: "DragCover", age: 1.2 },
  { label: "KickRifle", phase: "KickRifle", flag: "kickRifleAt", at: .95 },
];

/** In-page per-frame probe. Installed once; `window.openingProbe` accumulates across evaluates. */
async function InstallProbe(page) {
  await page.evaluate((C) => {
    const g = window.Tengxian;
    window.openingProbe = {
      previous: {}, maxStep: 0, maxStepAt: null, maxTurn: 0, maxCameraStep: 0, maxCameraTurn: 0, minShoulderBehind: Infinity,
      maxWristBend: 0, maxWristTwist: 0, maxReachRatio: 0, maxHandRotationStep: 0, maxHandRotationPhase: null,
      violations: [], kills: {}, deaths: {}, jaw: {}, releaseHealth: null, minHealth: Infinity, frames: 0,
    };
    const P = window.openingProbe, Vec = () => g.player.position.clone();
    const Jaw = (actor) => {
      const face = actor?.actor?.characterRig?.facial, c = face?.controls.find((c) => c.name === "Face_Jaw");
      return c ? c.bone.quaternion.angleTo(c.quaternion) : null;
    };
    const InScene = (s, role) => Object.values(s.scenes).some((h) => h && !h.done && h.lines?.some?.((l) => l.state === "playing" && l.line?.who === role));
    P.Sample = () => {
      const r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker, cam = g.player.camera;
      P.frames++;
      P.minHealth = Math.min(P.minHealth, g.player.health);
      // Lethal hits on the vanguard: how, in which phase.
      for (const id of C.vanguardIds) {
        const a = r.enemies.get(id);
        if (!a) continue;
        if (!a.__openingProbeWrapped) {
          a.__openingProbeWrapped = true;
          const original = a.TakeHit.bind(a);
          a.TakeHit = (damage, part, direction, info = {}) => {
            const was = a.alive, result = original(damage, part, direction, info);
            if (was && !a.alive) P.kills[id] = { phase: s.phase, time: r.time, kind: info?.kind || null, weapon: info?.weaponId || null, part };
            return result;
          };
        }
        if (!a.alive && !P.deaths[id]) P.deaths[id] = { phase: s.phase, time: r.time, health: a.health };
      }
      if (["Check", "KickRifle", "Released"].includes(s.phase) && !s.VanguardCleared() && P.violations.length < 30)
        P.violations.push({ phase: s.phase, error: "hand-back beat while a required vanguard man is alive" });
      // Teleports: the pelvis (not the root: chained clips re-root with the pelvis held still) of
      // every shown living actor, per frame.
      for (const a of [...Object.values(s.cast), ...r.squad, ...r.enemies.values()]) {
        if (!a) continue;
        const id = a.missionId || a.castId || a.id;
        if (!a.alive || a.openingStoryboardHidden || !a.actor?.root?.visible) { delete P.previous[id]; continue; }
        const previous = P.previous[id], pelvis = a.actor.characterRig?.bones?.pelvis;
        const src = pelvis && a.actor.poseVisible !== false ? "pelvis" : "root";
        const at = src === "pelvis" ? pelvis.getWorldPosition(Vec()) : a.actor.root.position;
        if (previous?.src === src) {
          const step = Math.hypot(at.x - previous.x, at.z - previous.z);
          const turn = Math.abs(Math.atan2(Math.sin(a.yaw - previous.yaw), Math.cos(a.yaw - previous.yaw)));
          if (step > P.maxStep) { P.maxStep = step; P.maxStepAt = { id, phase: s.phase, stage: r.flow.stage.id, age: s.Age }; }
          P.maxTurn = Math.max(P.maxTurn, turn);
          if (step > C.stepLimitM && P.violations.length < 30) P.violations.push({ id, phase: s.phase, age: s.Age, stage: r.flow.stage.id, step, clip: a.openingStoryboardPose?.clip || null,
            from: [previous.x, previous.z], to: [at.x, at.z], root: [a.actor.root.position.x, a.actor.root.position.z] });
        }
        P.previous[id] = { x: at.x, z: at.z, yaw: a.yaw, src };
      }
      // Camera and the first-person arms while the director owns the view. A cut under closed eyes
      // (the fade-in, the blast's black) is not a jump anyone sees.
      if ((r.opening?.eyeClosure ?? 0) >= .5) { P.camera = null; P.cameraRotation = null; }
      else if (s.CameraActive && s.playerBody) {
        if (P.camera) {
          const step = cam.position.distanceTo(Vec().fromArray(P.camera));
          if (step > P.maxCameraStep) { P.maxCameraStep = step; P.maxCameraStepAt = { phase: s.phase, age: s.Age, time: r.time }; }
        }
        if (P.cameraRotation) {
          const turn = cam.quaternion.angleTo(cam.quaternion.clone().fromArray(P.cameraRotation)) * 180 / Math.PI;
          if (turn > P.maxCameraTurn) { P.maxCameraTurn = turn; P.maxCameraTurnPhase = s.phase; }
        }
        P.camera = cam.position.toArray(); P.cameraRotation = cam.quaternion.toArray();
        for (const side of ["L", "R"]) {
          const shoulder = s.playerBody.characterRig.bones["upperArm" + side].getWorldPosition(Vec()); cam.worldToLocal(shoulder);
          P.minShoulderBehind = Math.min(P.minShoulderBehind, shoulder.z);
        }
        for (const [side, hand] of Object.entries(s.firstPersonState?.hands || {})) {
          P.maxWristBend = Math.max(P.maxWristBend, hand.wristBend || 0);
          P.maxWristTwist = Math.max(P.maxWristTwist, Math.abs(hand.wristTwist || 0));
          P.maxReachRatio = Math.max(P.maxReachRatio, hand.reachRatio || 0);
          const rot = hand.rotationStepDegrees || 0;
          if (rot > P.maxHandRotationStep) { P.maxHandRotationStep = rot; P.maxHandRotationPhase = s.phase; }
          if (rot >= 12 && (P.handFlips ??= []).length < 20) P.handFlips.push({ phase: s.phase, age: s.Age, side, pose: hand.pose, rot, time: r.time });
        }
      }
      if (P.wasCameraActive && !s.CameraActive && P.cameraRotation) {
        P.releaseCameraTurn = cam.quaternion.angleTo(cam.quaternion.clone().fromArray(P.cameraRotation)) * 180 / Math.PI;
        P.releaseHealth = g.player.health;
      }
      P.wasCameraActive = s.CameraActive;
      // Mouths: who is speaking (voice.Speech active) against the jaw of every speaking-cast face in view.
      if (r.voice?.Speech) for (const role of ["luo", "yaowa", "heyoutian", "liuwencai", "comrade", "runner", "interpreter", "ijaA", "ijaB", "guard"]) {
        const actor = s.SpeakerActor(role);
        if (!actor?.alive || actor.openingStoryboardHidden || !actor.actor?.root?.visible) continue;
        const jaw = Jaw(actor); if (jaw == null) continue;
        const row = P.jaw[role] ??= { speakingFrames: 0, speakingMax: 0, silentFrames: 0, silentMax: 0, silentMaxPhase: null, lastTalk: -Infinity };
        const talking = !!r.voice.Speech(role)?.active;
        if (talking || InScene(s, role)) row.lastTalk = r.time;
        if (talking) { row.speakingFrames++; row.speakingMax = Math.max(row.speakingMax, jaw); }
        // A listener: no line of his playing and none for SILENT_AFTER_S (the jaw eases shut after a line).
        else if (r.time - row.lastTalk > C.silentAfterS) { row.silentFrames++; if (jaw > row.silentMax) { row.silentMax = jaw; row.silentMaxPhase = s.phase; row.silentMaxTime = r.time; } }
      }
    };
  }, { vanguardIds: Storyboards.vanguardIds, silentAfterS: SILENT_AFTER_S, stepLimitM: STEP_LIMIT_M });
}

/** Step `frames` frames, sampling each; render the last one. */
const StepSampled = (page, frames) => page.evaluate((frames) => {
  const g = window.Tengxian;
  for (let i = 0; i < frames; i++) { g.StepFrames(1, 1 / 60, i === frames - 1); window.openingProbe.Sample(); }
  const r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker, m = g.Debug.FirstLevelMission();
  return { stage: m.stage, time: m.time, facts: m.facts, alive: g.player.alive, health: g.player.health,
    phase: s.phase, phaseTime: s.Age, luoM: (() => { const l = s.Squad("luo"); return l && !l.openingStoryboardHidden ? Math.hypot(l.position.x - g.player.camera.position.x, l.position.z - g.player.camera.position.z) : null; })(), flags: Object.fromEntries(Object.entries(s.flags).filter(([, v]) => typeof v === "number")),
    error: s.error };
}, frames);

/** Point the view at `point` for one rendered frame; returns the previous view to restore. */
const LookAt = (page, point, height = 1.2) => page.evaluate(({ point, height }) => {
  const g = window.Tengxian, p = g.player.position, eye = g.player.EyePosition, previous = { yaw: g.player.yaw, pitch: g.player.pitch };
  g.player.yaw = Math.atan2(p.x - point.x, p.z - point.z);
  g.player.pitch = Math.atan2(g.battlefield.GroundHeight(point.x, point.z) + height - eye.y, Math.hypot(p.x - point.x, p.z - point.z));
  g.StepFrames(4, 1 / 60, true);
  return previous;
}, { point, height });
const Restore = (page, view) => page.evaluate((view) => Object.assign(window.Tengxian.player, view), view);

export async function DriveOpening(ctx){
  const {page,output}=ctx,{Route,Interact,WaitStage,Capture}=CampaignActions(ctx);
  const shots=path.join(output,"Opening");await fs.mkdir(shots,{recursive:true});
  await page.waitForFunction(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().frontShow.bunker.ready,null,{timeout:60000});
  await InstallProbe(page);
  const taken=new Set(),phaseShots=new Set();
  let state;
  // 01–02 are watched: about 200 s of game time, 15 frames per round trip.
  for(let i=0;i<1400;i++){
    state=await StepSampled(page,15);
    assert.equal(state.error,undefined,"animation library loaded");
    if(!state.alive)await fs.writeFile(path.join(output,"Data_OpeningFailure.json"),JSON.stringify({state,
      damage:await page.evaluate(()=>window.missionDamage),probe:await page.evaluate(()=>window.openingProbe)},null,2));
    assert.ok(state.alive,"player survives the authored opening");
    for(const k of KEY_FRAMES){
      if(taken.has(k.label)||k.phase&&state.phase!==k.phase)continue;
      const due=k.luoWithinM?state.luoM!=null&&state.luoM<=k.luoWithinM:k.flag?state.flags[k.flag]!=null&&state.time-state.flags[k.flag]>=k.at:state.phaseTime>=k.age;
      if(!due)continue;
      taken.add(k.label);await page.screenshot({path:path.join(shots,`Key_${k.label}.png`)});
      console.log("KEYFRAME",k.label,state.time.toFixed(2));
    }
    if(state.phaseTime>=.35&&!phaseShots.has(state.phase)){
      phaseShots.add(state.phase);await page.screenshot({path:path.join(shots,`Phase_${state.phase}.png`)});
      console.log("STORYBOARD",state.stage,state.phase,state.time.toFixed(2));
    }
    if(state.phase==="Released")break;
  }
  const show=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),s=r.frontShow.bunker;
    return {...s.State(),health:g.player.health,control:r.controls?.kind||null,playerShots:r.Inventory().shots,
      vanguard:[...r.enemies.values()].filter(a=>a.missionEncounter==="bunkerAssault").map(a=>({id:a.missionId,alive:a.alive,health:a.health,essential:a.scriptEssential})),
      rifleInteraction:r.interact.points.get("MissionRifle")?.position?.toArray?.()||null};
  });
  await fs.writeFile(path.join(output,"Data_OpeningShow.json"),JSON.stringify(show,null,2));
  const probe=await page.evaluate(()=>{const {Sample,previous,...rest}=window.openingProbe;return rest;});
  await fs.writeFile(path.join(output,"Data_OpeningMotionContinuity.json"),JSON.stringify(probe,null,2));
  console.log("PROBE",JSON.stringify({maxStep:probe.maxStep,maxStepAt:probe.maxStepAt,maxCameraStep:probe.maxCameraStep,maxCameraTurn:probe.maxCameraTurn,
    maxCameraTurnPhase:probe.maxCameraTurnPhase,maxCameraStepAt:probe.maxCameraStepAt,handFlips:probe.handFlips,maxHandRotationStep:probe.maxHandRotationStep,maxHandRotationPhase:probe.maxHandRotationPhase,
    maxWristBend:probe.maxWristBend,maxWristTwist:probe.maxWristTwist,maxReachRatio:probe.maxReachRatio,minShoulderBehind:probe.minShoulderBehind,
    releaseCameraTurn:probe.releaseCameraTurn,releaseHealth:probe.releaseHealth,minHealth:probe.minHealth,kills:probe.kills,jaw:probe.jaw,violations:probe.violations.length}));
  // ---- phases: every director phase really started, in the table's order ---------------------
  assert.equal(show.phase,"Released","the director reaches the hand-back");
  for(const phase of DIRECTOR_PHASES)assert.ok(show.beats.includes(phase),`storyboard performed: ${phase}`);
  const firsts=[];for(const e of show.events)if(DIRECTOR_PHASES.includes(e.phase)&&!firsts.includes(e.phase))firsts.push(e.phase);
  assert.deepEqual(firsts,DIRECTOR_PHASES.filter(p=>firsts.includes(p)),"phases start in contract §5.3 order");
  for(const fact of ["bunkerCollapsed","captivesKilled","playerButtStruck","doorSearchStarted","rescueCallHeard","vanguardMeleeResolved","junctionShot","luoRescueComplete","playerDraggedFromWreck"])
    assert.ok(state.facts.includes(fact),`observed event: ${fact}`);
  assert.ok(show.captives.length===1&&show.captives.every(a=>!a.alive),"the comrade dies at the wall");
  // ---- physical events: ijaA / ijaB cut down, ijaD shot, before Check -------------------------
  const eventTime=phase=>show.events.find(e=>e.phase===phase)?.time;
  for(const id of Storyboards.vanguardIds){
    const actor=show.vanguard.find(a=>a.id===id);
    assert.ok(actor&&!actor.alive&&actor.health<=0&&!actor.essential,`${id} is really dead at the hand-back`);
    assert.ok(probe.deaths[id]?.time<=eventTime("Check"),`${id} died before Check (${JSON.stringify(probe.deaths[id])})`);
  }
  const {ijaA,ijaB,ijaD}=Storyboards.cast;
  // The cut lands at the clip's contact frame; He's (0.79 s into HeDadaoParryChop) falls after Flee has begun.
  for(const id of [ijaA,ijaB])assert.ok(["Chop","Parry","Flee"].includes(probe.kills[id]?.phase)&&probe.kills[id].kind==="blade"&&probe.kills[id].weapon==="Dadao",
    `${id} falls to the dadao contact (${JSON.stringify(probe.kills[id])})`);
  assert.ok(["DragCover","LongShot"].includes(probe.kills[ijaD]?.phase)&&probe.kills[ijaD].kind==="bullet",`${ijaD} is shot at the junction (${JSON.stringify(probe.kills[ijaD])})`);
  assert.ok(["liu","he","luo","forced"].includes(show.flags.junctionBy),`junction shot is attributed (${show.flags.junctionBy})`);
  // ---- continuity ---------------------------------------------------------------------------
  assert.deepEqual(probe.violations,[],"actors move continuously (no pelvis step > STEP_LIMIT_M per frame) and nobody is released early");
  assert.ok(probe.maxCameraStep<.14,`camera never jumps between shots (${probe.maxCameraStep})`);
  assert.ok(probe.maxCameraTurn<10,`camera turns continuously (${probe.maxCameraTurn}° in ${probe.maxCameraTurnPhase})`);
  assert.ok(probe.minShoulderBehind>.08,"both open sleeve roots stay behind the eye");
  assert.ok(probe.maxHandRotationStep<12,`palms never flip in one frame (${probe.maxHandRotationStep}° in ${probe.maxHandRotationPhase})`);
  assert.ok(probe.maxWristBend<=42.1&&probe.maxWristTwist<1&&probe.maxReachRatio<=.971,"wrists and reach stay anatomical");
  assert.ok(probe.releaseCameraTurn<5,"returning control keeps the last presented view");
  // ---- hand-back ----------------------------------------------------------------------------
  assert.equal(show.control,null,"movement returns at Released");
  assert.equal(show.playerShots,0,"the player did not clear the vanguard");
  assert.ok(probe.releaseHealth>0,`health at the hand-back ${probe.releaseHealth}`);
  console.log("HANDBACK",JSON.stringify({health:probe.releaseHealth,minHealth:probe.minHealth,junctionBy:show.flags.junctionBy,
    rescueS:eventTime("Released")-eventTime("Hold"),openingS:eventTime("Hold")-eventTime("Banter")}));
  // ---- mouths --------------------------------------------------------------------------------
  const spoken=Object.entries(probe.jaw).filter(([,row])=>row.speakingFrames>10);
  assert.ok(spoken.length>=4,`several visible speakers were sampled mid-line (${JSON.stringify(probe.jaw)})`);
  for(const [role,row] of spoken)assert.ok(row.speakingMax>=SPEAKING_JAW_RADIANS,`${role} opens the jaw while speaking (${row.speakingMax})`);
  for(const [role,row] of Object.entries(probe.jaw))if(row.silentFrames>10)
    assert.ok(row.silentMax<=SILENT_JAW_RADIANS,`${role} keeps the mouth closed while others speak (${row.silentMax} in ${row.silentMaxPhase})`);
  // ---- rifle pickup and the withdrawal (ordinary input) ---------------------------------------
  await page.evaluate(()=>window.Tengxian.StepFrames(2,1/60,true));
  await page.screenshot({path:path.join(shots,"Key_Released.png")});
  const pickup=await page.evaluate(()=>window.Tengxian.interact.Query(window.Tengxian.player)?.point?.id||null);
  if(pickup!=="MissionRifle")await Route([{x:show.rifleInteraction[0],z:show.rifleInteraction[2]}],"OpeningRifle",{stance:"crouch",arrivalM:.3});
  await Interact();
  await WaitStage("RearTrench",5);
  const armed=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
  assert.ok(armed.facts.includes("rifleRecovered"));assert.equal(armed.emptyHands,false);
  // Out of the mouth, over the crater step, down the SSW leg to the rear corner: a player withdrawing
  // under fire keeps moving (the squad covers); he does not stop to duel the fold man from the mouth.
  await Route(WITHDRAW_ROUTE.slice(0,AT_RC),"OpeningWithdraw",{fight:false,stance:"crouch"});
  // 「回头看见追兵占住刚才的位置」: at the rear corner he turns and looks back up the leg (crouched at the
  // corner for up to LOOKBACK_S) until a pursuer shows in the trench he has just left.
  const back=await LookAt(page,A.bunkerBend||Storyboards.withdraw.lane[3],1.3);
  let lookBack;
  for(let i=0;i<LOOKBACK_S*2;i++){
    lookBack=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),s=r.frontShow.bunker,eye=g.player.EyePosition;
      g.Debug.Key("KeyW",false);g.StepFrames(29,1/60,false);g.StepFrames(1,1/60,true);
      const cam=g.player.camera,T=cam.position.clone();
      const pursuit=(s.pursuit||[]).filter(q=>q.actor.alive).map(q=>{
        const at=r.Point(q.actor.position,1.3),view=at.clone().project(cam);
        return {id:q.spec.id,x:+q.actor.position.x.toFixed(2),z:+q.actor.position.z.toFixed(2),
          seen:!r.BlocksSight(eye,at)&&Math.abs(view.x)<1&&Math.abs(view.y)<1&&view.z<1};});
      return {pursuit,time:r.time,stage:r.flow.stage.id,player:g.player.position.toArray(),eye:T.toArray()};
    });
    if(lookBack.pursuit.some(p=>p.seen))break;
  }
  await page.screenshot({path:path.join(shots,"Key_WithdrawLookBack.png")});
  await Restore(page,back);
  console.log("LOOKBACK",JSON.stringify(lookBack));
  assert.ok(lookBack.pursuit.length>=3,"bunkerPursuit follows into the trench behind the withdrawal");
  // On to the collection: stop once it is in view; the scene gathers round the player.
  await Route(WITHDRAW_ROUTE.slice(AT_RC),"OpeningRearTrench",{fight:true,stance:"crouch",stopFact:"collectionPointSeen"});
  let meetShot=false;
  for(let i=0;i<80&&!meetShot;i++){
    const at=await StepSampled(page,30);
    if(at.flags.meetAt!=null&&at.time-at.flags.meetAt>=1.5){await page.screenshot({path:path.join(shots,"Key_CollectionMeet.png")});meetShot=true;}
  }
  assert.ok(meetShot,"CollectionMeet starts at the collection");
  await WaitStage("Support",120,{fight:true});
  const rear=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),s=r.frontShow.bunker;
    return {mission:g.Debug.FirstLevelMission(),
      pursuitEnemies:[...r.enemies.values()].filter(a=>a.missionEncounter==="bunkerPursuit"&&a.alive).map(a=>a.missionId),
      pursuitLeft:(s.pursuit||[]).filter(p=>p.actor.alive).map(p=>({id:p.spec.id,x:p.actor.position.x,z:p.actor.position.z})),
      ijaCEnemy:!!r.enemies.get("BunkerFollowA")?.alive,flags:s.flags};
  });
  const view=await LookAt(page,A.collection,.6);
  await page.screenshot({path:path.join(shots,"Key_Collection.png")});
  await Restore(page,view);
  for(const fact of ["rearTrenchEntered","cornerReached","collectionPointSeen","supportOrdersHeard"])assert.ok(rear.mission.facts.includes(fact),fact);
  for(const cue of ["CollectionMeet","SupportOrder"])assert.ok(rear.mission.voice.played.includes(cue),cue);
  assert.deepEqual(rear.pursuitEnemies,[],"pursuers leave the fight at the collection (retire)");
  assert.equal(rear.ijaCEnemy,false,"the fold man is no longer an active enemy after the collection");
  assert.ok(rear.mission.front.collection.litters>=4&&rear.mission.front.collection.people>=8,"casualty collection is present");
  await fs.writeFile(path.join(output,"Data_OpeningRear.json"),JSON.stringify({lookBack,rear:{...rear,mission:undefined,facts:rear.mission.facts}},null,2));
  await Capture("OpeningSupport");
  console.log("ok 01–02 normal progression to Support");
  await InstallRearActing(page);
}

/** 03 speakers (Front cues and the guard) are sampled for visible acting until CheckOpeningActing. */
async function InstallRearActing(page){
  await page.evaluate(()=>{
    const s=window.Tengxian.Debug.FirstLevelMissionRuntime().frontShow.bunker,update=s.UpdatePerformances;
    window.openingRearActing={};window.openingRearHeard={};
    s.UpdatePerformances=function(){
      const current=this.CurrentSpeaker(),who=current?.who;
      if(current&&["guard","zhou","luo"].includes(who)){
        const key=current.cue+"/"+who,row=window.openingRearHeard[key]??={frames:0,visibleFrames:0};
        row.frames++;if(this.SpeakerActor(who)?.actor.poseVisible)row.visibleFrames++;
      }
      for(const role of ["guard","zhou","luo"]){
        const actor=this.SpeakerActor(role),rig=actor?.actor?.characterRig,state=rig?.openingActorPerformanceState;
        if(!state?.speaking)continue;
        const key=state.cue+"/"+role,head=rig.bones.head.quaternion;
        const row=window.openingRearActing[key]??={frames:0,head:head.toArray(),turn:0};
        row.frames++;row.turn=Math.max(row.turn,head.angleTo(head.clone().fromArray(row.head)));
      }
      return update.apply(this,arguments);
    };
  });
}

export async function CheckOpeningActing(ctx){
  const {page,output}=ctx;
  const rearActing=await page.evaluate(()=>window.openingRearActing);
  const heard=await page.evaluate(()=>window.openingRearHeard);
  await fs.writeFile(path.join(output,"Data_OpeningRearActing.json"),JSON.stringify(rearActing,null,2));
  await fs.writeFile(path.join(output,"Data_OpeningRearHeard.json"),JSON.stringify(heard,null,2));
  // Culled actors legitimately skip detailed bone updates: check every audible 03 speaker that
  // actually rendered nearby has a live performance.
  const visible=Object.keys(heard).filter(key=>heard[key].visibleFrames>10);
  for(const key of visible){
    assert.ok(rearActing[key]?.frames>10,`${key}: actual visible 03 speaker has an active performance`);
    assert.ok(rearActing[key].turn>.03,`${key}: actual visible 03 speaker visibly turns/nods`);
  }
  assert.deepEqual(ctx.errors,[]);
  console.log("ok 01–03 normal progression, continuous hands and visible dialogue performances",JSON.stringify(visible));
}

// ---- non-ideal hand-back orders (contract v1.1 ③: 02 must never stall) -------------------------
/** Where the junction man ducks for the "hide" variant: the depth sap past J, walled off from the rescue. */
export const HANDBACK_HIDE_POINT = Object.freeze({ x: FRONT_SPACE.pursuitFallback[0].x + .6, z: FRONT_SPACE.pursuitFallback[0].z + 3 });
/**
 * Start at BunkerRescue (debug start 2, `missionStage=2`) and bend the long shot (it starts with the DragCover pull):
 *   "miss":  Liu Wencai fires and misses (his line to the junction man is spoiled for his shot only);
 *            He Youtian's backup at +4 s must drop him.
 *   "hide":  the junction man ducks into the depth sap as DragCover begins, out of every rescuer's
 *            sight; Luo's forced shot at +8 s (or the +8.5 s timeout) must take him.
 *   "early": the junction man is already dead when DragCover begins (the backdrop fire got him);
 *            nobody shoots a dead man and the hand-back does not wait for a shot.
 * Each still reaches Released with ijaA/ijaB cut down, and the real F pickup still starts RearTrench.
 */
export async function DriveHandbackNegative(page,variant,output){
  await page.waitForFunction(()=>window.Tengxian.Debug.FirstLevelMissionRuntime()?.frontShow?.bunker?.ready,null,{timeout:120000});
  // A debug start places the rescue circle on its first frames (instant Puts from spawn points):
  // watch continuity from Hold +0.5 s, as a player arriving from 01 would.
  await page.evaluate(()=>{const g=window.Tengxian,s=g.Debug.FirstLevelMissionRuntime().frontShow.bunker;
    for(let i=0;i<600&&!(s.phase==="Hold"&&s.Age>.5);i++)g.StepFrames(1,1/60,false);});
  await InstallProbe(page);
  await page.evaluate(({variant,C})=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),s=r.frontShow.bunker;
    const F=window.handbackFixture={variant,applied:false,blocked:0};
    const blocks=r.BlocksSight.bind(r);
    r.BlocksSight=(from,to)=>{
      const ijaD=r.enemies.get(C.ijaD);
      if(F.variant==="miss"&&["DragCover","LongShot"].includes(s.phase)&&s.flags["shot:liu"]!=null&&s.flags["shot:he"]==null
        &&ijaD&&Math.hypot(to.x-ijaD.position.x,to.z-ijaD.position.z)<1){F.blocked++;return true;}
      return blocks(from,to);
    };
    const stage=s.Stage.bind(s);
    s.Stage=function(phase){
      const ijaD=r.enemies.get(C.ijaD);
      if(phase==="DragCover"&&!F.applied&&ijaD?.alive){
        F.applied=true;
        if(F.variant==="hide"){
          s.Put(ijaD,{x:C.hide.x,z:C.hide.z,yaw:0});
          F.hidden={x:ijaD.position.x,z:ijaD.position.z};delete window.openingProbe.previous[C.ijaD];   // the fixture's own move
          F.sightFrom={liu:r.BlocksSight(r.Point(C.liuShot,1.4),r.Point(C.hide,1.2))};
        }
        if(F.variant==="early"){s.Kill(ijaD,"bullet");F.earlyKilled=!ijaD.alive;}
      }
      return stage(phase);
    };
  },{variant,C:{ijaD:Storyboards.cast.ijaD,liuShot:Storyboards.rescue.liuShot,hide:HANDBACK_HIDE_POINT}});
  let state;
  for(let i=0;i<600;i++){
    state=await StepSampled(page,15);
    assert.equal(state.error,undefined);
    assert.ok(state.alive,`${variant}: player survives`);
    if(state.phase==="Released")break;
  }
  const result=await page.evaluate(({ijaD})=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),s=r.frontShow.bunker,P=window.openingProbe;
    const a=r.enemies.get(ijaD);
    return {phase:s.phase,events:s.events,flags:Object.fromEntries(Object.entries(s.flags).filter(([,v])=>typeof v!=="object")),
      fixture:window.handbackFixture,kills:P.kills,deaths:P.deaths,violations:P.violations,facts:[...r.flow.facts],
      ijaD:a?{alive:a.alive,x:a.position.x,z:a.position.z}:null,control:r.controls?.kind||null,health:g.player.health};
  },{ijaD:Storyboards.cast.ijaD});
  await fs.writeFile(path.join(output,`Data_Handback_${variant}.json`),JSON.stringify(result,null,2));
  const at=phase=>result.events.find(e=>e.phase===phase)?.time;
  assert.equal(result.phase,"Released",`${variant}: the hand-back still happens`);
  assert.equal(result.control,null,`${variant}: control returns`);
  assert.deepEqual(result.violations,[],`${variant}: no teleports, no early hand-back`);
  for(const fact of ["vanguardMeleeResolved","junctionShot","luoRescueComplete","playerDraggedFromWreck"])assert.ok(result.facts.includes(fact),`${variant}: ${fact}`);
  // The long shot starts with the DragCover pull (longShotAt); Check follows the junction man's fall.
  const waited=at("Check")-result.flags.longShotAt;
  assert.ok(waited<=Storyboards.timeouts.longShotForceS+2,`${variant}: the hand-back never waits past the long-shot timeouts (${waited.toFixed(2)} s)`);
  if(variant==="miss"){
    assert.ok(result.fixture.blocked>0&&result.flags["shot:liu"]!=null,"miss: Liu really fired and missed");
    assert.equal(result.flags.junctionBy,"he","miss: He Youtian's backup shot drops the junction man");
  }
  if(variant==="hide"){
    assert.equal(result.fixture.sightFrom?.liu,true,"hide: the hiding place is out of Liu's sight");
    assert.ok(["luo","forced"].includes(result.flags.junctionBy),`hide: the timeout takes him (${result.flags.junctionBy})`);
  }
  if(variant==="early"){
    assert.ok(result.fixture.earlyKilled,"early: already down");
    assert.equal(result.flags["shot:liu"],undefined,"early: nobody shoots a dead man");
    const lingered=at("Check")-at("LongShot");
    assert.ok(lingered<1.5,`early: the hand-back does not wait for a shot (${lingered.toFixed(2)} s after LongShot)`);
  }
  await page.screenshot({path:path.join(output,`Handback_${variant}_Released.png`)});
  // The real F pickup hands 02 on to the withdrawal.
  await page.evaluate(()=>{const g=window.Tengxian;g.StepFrames(2,1/60,true);g.Debug.Key("KeyF",true);g.StepFrames(90,1/60,false);g.Debug.Key("KeyF",false);g.StepFrames(10,1/60,true);});
  const after=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
  assert.ok(after.facts.includes("rifleRecovered")&&after.stage==="RearTrench",`${variant}: the rifle pickup hands 02 on to the withdrawal`);
  console.log(`ok hand-back (${variant}): Check ${waited.toFixed(2)} s after LongShot, junction by ${result.flags.junctionBy}`);
  return result;
}
