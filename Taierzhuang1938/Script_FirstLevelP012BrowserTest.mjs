// P012 真浏览器验收。截图成功不等于玩法通过，运行时断言与人工看图分别记录。
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { P012_ANCHORS, P012_ROUTES, FIRST_LEVEL_P012_LAYOUT } from "./Data_FirstLevelP012Layout.mjs";
import { P012SouthPoint, P012StationPoint } from "./Data_FirstLevelP012Space.mjs";
import { openingActivities } from "./Data_FirstLevelP012Opening.mjs";
import { P012_STATION_HEIGHTS } from "./Data_FirstLevelP012Station.mjs";
import { VOICE_LINES as chapterVoices } from "./Data_MissionCh1.mjs";
import { VOICE_LINES as prologueVoices } from "./Data_MissionCh0.mjs";
import { P012_COMPANION_CAST } from "./Data_FirstLevelP012Cast.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
// Predeclared sensitivity settings, not calibrated claims about human skill.
// Neither setting reads live recoil offsets or acquires targets outside the camera.
const perceptionName = process.argv.find(arg => arg.startsWith("--perception="))?.split("=")[1];
const perceptionProfiles = {
  bounded: { name: "bounded", confirmationFrames: 23, turnRadPerSecond: 1.5, errorRad: 0.004, shotIntervalS: 1.5 },
  deliberate: { name: "deliberate", confirmationFrames: 36, turnRadPerSecond: 1, errorRad: 0.007, shotIntervalS: 2 },
};
if (perceptionName && !perceptionProfiles[perceptionName]) throw new Error(`Unknown perception profile: ${perceptionName}`);
const perceptionProfile = perceptionProfiles[perceptionName] || null;
const airRouteFixture = process.argv.find(arg => arg.startsWith("--air-route="))?.split("=")[1];
const airReview = ["--air-rescue", "--air-carry", "--air-dive", "--air-drop"].some(flag => process.argv.includes(flag));
if (airReview && !["open", "ditch"].includes(airRouteFixture)) {
  throw new Error("Air rescue/carry/dive review requires --air-route=open or --air-route=ditch; no scene checks have run");
}
if (process.argv.includes("--air-drop") && !["--air-rescue", "--air-carry", "--air-dive"].some(flag => process.argv.includes(flag))) {
  throw new Error("--air-drop requires --air-rescue, --air-carry or --air-dive");
}
const runLabel = process.argv.find(arg => arg.startsWith("--run-label="))?.split("=")[1] || "";
const orientationReview = process.argv.includes("--orientation");
const savedInfiniteAmmo = process.argv.includes("--saved-infinite-ammo");
const openingCausalityReview = process.argv.includes("--opening-causality") || savedInfiniteAmmo;
const openingGuidanceReview = process.argv.includes("--opening-guidance");
const trainReview = process.argv.includes("--train-review");
const stationReview = process.argv.includes("--station-review") || trainReview;
const spatialReview = process.argv.includes("--spatial-review");
if (runLabel && !/^[A-Za-z0-9_]+$/.test(runLabel)) throw new Error("Run label must contain only English letters, digits, or underscores");
const outputDir = process.env.P012_SCREENSHOT_DIR || path.join(os.tmpdir(),
  perceptionProfile ? `P012WhiteboxPerception_${perceptionProfile.name}${runLabel ? `_${runLabel}` : ""}`
    : process.argv.includes("--campaign") ? `P012WhiteboxCampaign${runLabel ? `_${runLabel}` : ""}`
      : `P012WhiteboxReview${runLabel ? `_${runLabel}` : ""}`);
await fs.mkdir(outputDir, { recursive: true });
const runContext = { startedAt: new Date().toISOString(), sourceRoot: rootDir,
  arguments: process.argv.slice(2), assertionOutcome: "notFinished" };
try {
  runContext.revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
  runContext.workingTreeChanges = execFileSync("git", ["status", "--short", "--", "Taierzhuang1938"],
    { cwd: rootDir, encoding: "utf8" }).trim();
} catch { runContext.revision = null; }
const runContextPath = path.join(outputDir, "Data_P012RunContext.json");
await fs.writeFile(runContextPath, JSON.stringify(runContext, null, 2));
console.log("P012 requested review", JSON.stringify(runContext));
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const pacingChecks = [];
const audioSmoke = process.argv.includes("--audio-smoke");
if (audioSmoke && ["--campaign", "--frontline", "--prelude", "--pacing", "--voice-timing"].some(flag => process.argv.includes(flag))) {
  throw new Error("--audio-smoke is a separate real-time playback fixture, not accelerated campaign timing");
}
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) {
    errors.push(message.text());
  }
});

function Check(condition, label, detail = "") {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  console.log(`ok  ${label}${detail ? ` — ${detail}` : ""}`);
}

function AirTurnEvidence(views) {
  const spans=[];
  let span=null,previous=null;
  for(const view of views){
    const visible=view.preset==="crowdTurn"&&view.phase==="approach"&&view.airVisible;
    const continuous=visible&&span&&previous&&view.runId===previous.runId
      &&view.flightTime>previous.flightTime&&view.at>previous.at&&view.at-previous.at<=.35;
    if(!visible)span=null;
    else if(continuous){span.to=view.at;span.flightTo=view.flightTime;span.samples++;}
    else {span={runId:view.runId??null,from:view.at,to:view.at,flightFrom:view.flightTime,flightTo:view.flightTime,samples:1};spans.push(span);}
    previous=view;
  }
  return {spans,longestVisibleS:Math.max(0,...spans.map(span=>span.to-span.from)),
    jointViews:views.filter(view=>view.preset==="crowdTurn"&&view.phase==="approach"
      &&view.airVisible&&view.bearersVisible>=2&&view.civiliansVisible>=1).length,
    definition:"Uninterrupted actual free-camera aircraft visibility before crowd fire; no stitching across occlusion, runs or retries."};
}

// 只驱动移动与交互输入，不改任务阶段，不传送，不把完成标志直接写进导演。
async function PlayPrelude() {
  let result;
  const orientations = [];
  const spatialCaptures = [];
  for (let chunk = 0; chunk < 64; chunk += 1) {
    result = await page.evaluate(({ orientationReview, openingCausalityReview, savedInfiniteAmmo, northShelter, northShelterRadius }) => {
      const game = window.Tengxian;
      const bot = window.p012ReviewBot ||= { held: {}, trace: [], frame: 0, lastProgress: 0, progressKey: "" };
      const DitchEvidence=()=>{
        const flow=game.Debug.P012(),scene=game.Debug.P012Scene(),p=game.player.position;
        const impact=scene.mortarImpactPosition,eye=game.player.EyePosition;
        let ray=null;
        if(impact){
          const from=eye.clone().set(impact.x,game.battlefield.GroundHeight(impact.x,impact.z)+.35,impact.z);
          const direction=eye.clone().sub(from),distance=direction.length();
          const hit=game.battlefield.Raycast(from,direction.normalize(),distance);
          ray={from:from.toArray(),to:eye.toArray(),distance,blocked:!!hit&&hit.t<distance-.1,
            hit:hit?{t:hit.t,normal:hit.normal,block:hit.box?.id||hit.box?.tag||null,
              box:hit.box?{x:hit.box.x,z:hit.box.z,w:hit.box.w,d:hit.box.d,h:hit.box.h}:null}:null};
        }
        return {at:flow.elapsed,position:p.toArray(),stance:game.player.stance,impact,
          impactCount:scene.mortarImpactCount,impactFact:flow.facts.includes("northNearMissImpact"),
          northCovered:flow.facts.includes("northCovered"),distanceToShelter:Math.hypot(p.x-northShelter.x,p.z-northShelter.z),
          shelter:northShelter,shelterRadius:northShelterRadius,ray};
      };
      const NorthSceneEvidence=()=>{
        const scene=game.Debug.P012Scene(),flow=game.Debug.P012(),eye=game.camera.position;
        const people=(scene.openingCast||[]).map(entry=>{
          const actor=game.ai.soldiers.find(actor=>actor.id===entry.actorId);
          return {...entry,alive:!!actor?.alive,stance:actor?.stance,scriptDefensive:!!actor?.scriptDefensive,
            actualPosition:actor?.position.toArray(),goal:actor?.goal.toArray(),
            distanceToPlayer:actor?actor.position.distanceTo(game.player.position):null};
        });
        const impact=scene.mortarImpactPosition;
        let projection=null,cameraRay=null;
        if(impact){
          const point=eye.clone().set(impact.x,game.battlefield.GroundHeight(impact.x,impact.z)+.35,impact.z);
          const direction=point.clone().sub(eye),distance=direction.length(),hit=game.battlefield.Raycast(eye,direction.normalize(),distance);
          projection=point.clone().project(game.camera).toArray();
          cameraRay={from:eye.toArray(),to:point.toArray(),distance,blocked:!!hit&&hit.t<distance-.1,
            hit:hit?{t:hit.t,block:hit.box?.id||hit.box?.tag||null}:null};
        }
        return {at:flow.elapsed,beat:flow.beat,player:game.player.position.toArray(),camera:eye.toArray(),
          yaw:game.player.yaw,pitch:game.player.pitch,people,resting:scene.resting||null,stageZero:scene.stageZero,
          impact,projection,cameraRay,ditch:DitchEvidence(),scope:"ordinary live player camera, no camera or actor placement"};
      };
      const Key = (code, down) => {
        if (!!bot.held[code] === down) return;
        game.Debug.Key(code, down); bot.held[code] = down;
      };
      for (let frame = 0; frame < 600; frame += 1) {
        const flow = game.Debug.P012();
        if(flow.beatIndex>=3&&flow.beatIndex<=5){
          const scene=game.Debug.P012Scene();
          if(scene.binocularOwned||game.interact.Point("p012_binocularTake")||game.interact.Point("p012_binocularReturn"))
            throw new Error("Removed binocular equipment or interaction remains in the live opening");
          if(!bot.lastNorthSample||flow.elapsed-bot.lastNorthSample>=.25){
            (bot.northEscortTrace||=[]).push(NorthSceneEvidence());bot.lastNorthSample=flow.elapsed;
          }
          if(flow.beatIndex===3&&!bot.departureCaptured){
            bot.departureCaptured=true;bot.pendingOrientation={index:0,...NorthSceneEvidence()};break;
          }
          if(scene.resting?.count===3&&!bot.restingCaptured){
            bot.restingCaptured=true;bot.pendingCausality={id:"NorthRoadResting",...NorthSceneEvidence()};break;
          }
        }
        const pendingSpeech=game.story.p012PendingCompletion;
        if(pendingSpeech&&["p012_text_BriefingMission","p012_text_BriefingRoute","p012_text_BriefingReply"].includes(pendingSpeech.key)
          &&!(bot.briefingCaptured||[]).includes(pendingSpeech.key)){
          (bot.briefingCaptured||=[]).push(pendingSpeech.key);
          const guide=game.ai.soldiers.find(actor=>actor.castId==="luo"),subtitle=document.querySelector(".hudSubtitle");
          const visibleActor=guide?.actor,model=visibleActor?.characterRig?.root;
          visibleActor?.root.updateMatrixWorld(true);
          const Forward=(node,z)=>node?guide.position.clone().set(0,0,z).transformDirection(node.matrixWorld).toArray():null;
          bot.pendingBriefing={id:pendingSpeech.key,at:flow.elapsed,speech:{...pendingSpeech},
            guide:guide?{position:guide.position.toArray(),yaw:guide.yaw}:null,
            guideActorRootYaw:visibleActor?.root.rotation.y??null,localModelYaw:model?.rotation.y??null,
            bodyForwardWorld:Forward(visibleActor?.body,-1),modelAuthoredForwardWorld:Forward(model,1),
            forwardConvention:"body local -Z; GLB authored local +Z transformed by its actual matrix; face readability requires screenshot review",
            player:game.player.position.toArray(),playerEye:game.player.EyePosition.toArray(),
            yaw:game.player.yaw,pitch:game.player.pitch,rawSay:subtitle?.textContent||"",subtitleClass:subtitle?.className,
            scope:"actual in-progress subtitle and ordinary player camera; no actor/camera placement"};break;
        }
        if([4,5].includes(flow.beatIndex)&&pendingSpeech?.key==="p012_text_RegroupCheck"&&!bot.regroupCaptured){
          bot.regroupCaptured=true;bot.pendingCausality={id:"NorthRegroupCount",subtitle:pendingSpeech.text,...NorthSceneEvidence()};break;
        }
        if(flow.beatIndex===5&&flow.routeIndex>=4&&!bot.ammoDoglegCaptured){
          bot.ammoDoglegCaptured=true;bot.pendingCausality={id:"AmmoDogleg",...NorthSceneEvidence(),objective:flow.objective};break;
        }
        if(flow.beatIndex===2){
          const inspection=game.Debug.P012Scene().guideInspection;
          if(inspection&&(!bot.firstInspection||bot.firstInspection.startedAt===inspection.startedAt)){
            bot.firstInspection ||= {...inspection};
            const guide=game.ai.soldiers.find(actor=>actor.castId==="luo");
            if(guide)(bot.inspectionTrace||=[]).push({at:flow.elapsed,inspection:{...inspection},
              guide:guide.position.toArray(),yaw:guide.yaw,player:game.player.position.toArray()});
          }
        }
        if (window.p012PendingStationView) break;
        if (window.p012PendingTrafficView) break;
        if (window.p012PendingSpatialView) break;
        if (window.p012PendingTrainView) break;
        if (window.p012PendingStageZeroView) break;
        const objective = flow.objective;
        if (flow.beatIndex >= 6 || !game.player.Alive) break;
        if(openingCausalityReview&&!bot.emptyHandsTested&&!flow.facts.includes("weapon")){
          const before={...game.Debug.Slots(),ammo:game.state.ammo,clips:game.state.clips,shots:game.state.playerShots};
          game.Debug.Mouse(0,true);game.StepFrames(2,1/30,false);game.Debug.Mouse(0,false);
          const after={...game.Debug.Slots(),ammo:game.state.ammo,clips:game.state.clips,shots:game.state.playerShots};
          if(before.weapon!==null||before.viewmodel!==null||before.ammo!==0||before.clips!==0)
            throw new Error(`Rifle visible or ammunition present before issue: ${JSON.stringify(before)}`);
          if(after.shots!==before.shots)throw new Error("Unissued rifle fired before actual pickup");
          bot.emptyHandsTested=true;bot.pendingCausality={id:"BeforeRifleIssue",before,after};break;
        }
        if(openingCausalityReview&&flow.facts.includes("weapon")&&!bot.rifleCaptured){
          const slots=game.Debug.Slots();
          if(slots.weapon!=="HanYang"||slots.viewmodel!=="HanYang"||game.state.ammo!==0||game.state.clips!==0)
            throw new Error(`Rifle issue did not produce the empty HanYang: ${JSON.stringify({slots,ammo:game.state.ammo,clips:game.state.clips})}`);
          bot.rifleCaptured=true;bot.pendingCausality={id:"RifleReceived",at:flow.elapsed,
            slots,ammo:game.state.ammo,clips:game.state.clips};break;
        }
        if(openingCausalityReview&&flow.beatIndex===2&&!bot.issueDepartureCaptured){
          if(game.state.ammo!==0||game.state.clips!==3||game.Debug.P012Scene().weaponActionCount!==0)
            throw new Error(`B02 departure wrongly requires loading or duplicates ammunition: ${JSON.stringify({ammo:game.state.ammo,clips:game.state.clips,scene:game.Debug.P012Scene().weaponActionCount})}`);
          bot.issueDepartureCaptured=true;bot.pendingCausality={id:"AmmoIssueDeparture",at:flow.elapsed,
            slots:game.Debug.Slots(),ammo:game.state.ammo,clips:game.state.clips,
            weaponActionCount:game.Debug.P012Scene().weaponActionCount,position:game.player.position.toArray()};break;
        }
        if(openingCausalityReview&&flow.beatIndex===2&&flow.routeIndex>=1&&!bot.unloadedMovementCaptured){
          if(game.state.ammo!==0||game.state.clips!==3||game.Debug.P012Scene().weaponActionCount!==0)
            throw new Error("Ordinary departure movement unexpectedly loaded or changed issued ammunition");
          bot.unloadedMovementCaptured=true;bot.pendingCausality={id:"UnloadedVillageDeparture",at:flow.elapsed,
            ammo:game.state.ammo,clips:game.state.clips,routeIndex:flow.routeIndex,position:game.player.position.toArray()};break;
        }
        if(savedInfiniteAmmo&&bot.unloadedMovementCaptured&&!bot.savedReloadInput){
          bot.savedReloadInput={at:flow.elapsed,ammo:game.state.ammo,clips:game.state.clips};
          game.Debug.Key("KeyR",true);game.Debug.Key("KeyR",false);
        }
        if(bot.savedReloadInput&&game.state.ammo>0&&!bot.savedReloadResult)bot.savedReloadResult={at:flow.elapsed,ammo:game.state.ammo,clips:game.state.clips,weaponActionCount:game.Debug.P012Scene().weaponActionCount};
        if(openingCausalityReview&&flow.beatIndex===4){
          const ditch=DitchEvidence();
          if(!bot.lastDitch?.northCovered&&ditch.northCovered){
            if(!ditch.impactFact||ditch.distanceToShelter>northShelterRadius||ditch.stance==="stand"||!ditch.ray?.blocked)
              throw new Error(`northCovered without actual ditch shelter: ${JSON.stringify(ditch)}`);
            bot.ditchCaptured=true;bot.pendingCausality={id:"NorthDitchEntered",before:bot.lastDitch,after:ditch};
            bot.lastDitch=ditch;break;
          }
          bot.lastDitch=ditch;
          const impacts=game.Debug.P012Scene().mortarImpactCount;
          if(bot.preShellImpacts===undefined)bot.preShellImpacts=impacts;
          if(!flow.facts.includes("northNearMissImpact")&&objective.requiredAction==="sprint")throw new Error("Shell sprint objective preceded actual impact");
          if(flow.facts.includes("northNearMissImpact")&&!(impacts>bot.preShellImpacts))throw new Error("Near-miss fact without actual mortar impact growth");
          if(flow.facts.includes("northApproachChat")&&!flow.facts.includes("northNearMissRequested")&&!bot.chatCaptured){
            bot.chatCaptured=true;bot.pendingCausality={id:"NorthChatBeforeShell",at:flow.elapsed,impacts,objective};break;
          }
          if(flow.facts.includes("northNearMissImpact")&&!bot.impactCaptured){
            bot.impactStartedAt??=flow.elapsed;
            const age=flow.elapsed-bot.impactStartedAt;
            const capture=[0,.12,.4,1].find(offset=>age+1e-6>=offset&&!(bot.impactOffsets||[]).includes(offset));
            if(capture!==undefined){
              (bot.impactOffsets||=[]).push(capture);
              bot.pendingCausality={id:`NorthImpact${Math.round(capture*1000)}ms`,offsetRequested:capture,
                actualOffset:age,...NorthSceneEvidence()};break;
            }
            if(age>=1){
            Key("KeyW",false);Key("ShiftLeft",false);Key("KeyF",false);
            if(game.player.stance!=="prone")game.Debug.Key("KeyZ");
            game.StepFrames(18,1/30,false);
            if(game.player.stance!=="prone")throw new Error("Actual prone input did not change player stance");
            const leader=game.ai.soldiers.find(actor=>actor.castId==="luo");
            if(leader?.stance!==2)throw new Error("Luo did not physically go prone after impact");
            const early=DitchEvidence();
            if(early.distanceToShelter<=northShelterRadius)throw new Error("Early-prone negative fixture is already in the real ditch");
            if(early.northCovered)throw new Error("Early road prone incorrectly completed ditch entry");
            bot.earlyDitchNegative=early;
            bot.impactCaptured=true;bot.pendingCausality={id:"NorthActualImpactProne",at:game.Debug.P012().elapsed,impacts,baseline:bot.preShellImpacts,stance:game.player.stance,guideStance:leader.stance,objective,earlyDitchNegative:early};break;
            }
          }
        }
        const progressKey = [flow.beat, flow.routeIndex, flow.orientationIndex, flow.facts.join(",")].join("|");
        if (bot.progressKey !== progressKey) {
          bot.progressKey = progressKey; bot.lastProgress = flow.elapsed;
          bot.trace.push({ at: flow.elapsed, beat: flow.beat, action: flow.action,
            routeIndex: flow.routeIndex, orientationIndex: flow.orientationIndex });
        }
        if (flow.elapsed - bot.lastProgress > 65) break;
        game.Debug.Mouse(2,false);
        const target = objective.target;
        if (!target) break;
        const dx = target.x - game.player.position.x, dz = target.z - game.player.position.z;
        const distance = Math.hypot(dx, dz);
        const interactionId = objective.interactionId;
        const following = objective.requiredAction === "follow";
        const crouching = objective.requiredStance === "crouch";
        if (game.player.stance !== (crouching ? "crouch" : "stand")) game.Debug.Key(game.player.stance==="prone"?"KeyZ":"KeyC");
        const arrive = interactionId ? flow.beatIndex === 1 ? 0.35 : 1.6
          // Respect the public opening follow radius instead of deliberately
          // walking into the leader's backpack. Later carry/escort stays unchanged.
          : following ? [0,1,2,3,4].includes(flow.beatIndex) ? objective.arrivalRadiusM : 1.2 : flow.beatIndex === 4 ? 2 : 0.8;
        const move = distance > arrive && !bot.held.KeyF;
        Key("KeyW", move);
        Key("ShiftLeft", move && objective.requiredAction === "sprint" && !crouching);
        if (distance > 0.15) game.player.yaw = Math.atan2(-dx, -dz);
        if (objective.lookAt && distance <= 2.8) {
          game.player.yaw = Math.atan2(-(objective.lookAt.x - game.player.position.x),
            -(objective.lookAt.z - game.player.position.z));
          Key("KeyW", false);
        }
        const point = interactionId && game.interact.Point(interactionId);
        if (point && distance <= 1.7) {
          const anchor = point.Anchor ? point.Anchor() : point.position;
          game.player.yaw = Math.atan2(-(anchor.x - game.player.position.x), -(anchor.z - game.player.position.z));
          if (game.interact.Query(game.player)?.point?.id === interactionId) {
            Key("KeyW", false);
            Key("KeyF", true);
          }
        } else Key("KeyF", false);
        if (flow.beatIndex !== 1 && objective.requiredAction === "reload" && distance < 2.7 && bot.frame % 60 === 0) game.Debug.Key("KeyR");
        game.StepFrames(1, 1 / 30, openingCausalityReview&&flow.beatIndex===4);
        bot.frame += 1;
      }
      for (const code of Object.keys(bot.held)) Key(code, false);
      // Impact captures use the already rendered actual frame, not a later dust state.
      if(!/^NorthImpact\d+ms$/.test(bot.pendingCausality?.id||""))game.StepFrames(1);
      const orientation = bot.pendingOrientation ? { ...bot.pendingOrientation,
        player: game.player.position.toArray(), yaw: game.player.yaw, pitch: game.player.pitch,
        camera: game.camera.position.toArray() } : null;
      bot.pendingOrientation = null;
      const causality=bot.pendingCausality||null;bot.pendingCausality=null;
      const stationView=window.p012PendingStationView||null;window.p012PendingStationView=null;
      const spatialView=window.p012PendingSpatialView||null;window.p012PendingSpatialView=null;
      const trainView=window.p012PendingTrainView||null;window.p012PendingTrainView=null;
      const stageZeroView=window.p012PendingStageZeroView||null;window.p012PendingStageZeroView=null;
      const briefingView=bot.pendingBriefing||null;bot.pendingBriefing=null;
      const trafficView = window.p012PendingTrafficView || null;
      if(trafficView)trafficView.openingCast=game.Debug.P012Scene?.().openingCast;
      window.p012PendingTrafficView = null;
      return { flow: game.Debug.P012(), scene: game.Debug.P012Scene?.(),
        orientation, trafficView, causality, stationView, spatialView, trainView, briefingView,stageZeroView,
        position: game.player.position.toArray(), health: game.player.health, alive: game.player.Alive,
        trace: bot.trace, stalled: game.Debug.P012().elapsed - bot.lastProgress > 65,
        weapons: game.Debug.Slots(), carry: game.carry.KindId, ammo: game.state.ammo, interact: game.Debug.Interact() };
    }, { orientationReview, openingCausalityReview,savedInfiniteAmmo,northShelter:openingActivities.northShelterPosition,northShelterRadius:openingActivities.northShelterRadiusM });
    if(result.stationView) await CaptureStationView(result.stationView);
    if(result.stageZeroView){
      await fs.writeFile(path.join(outputDir,`Data_P012StageZero_${result.stageZeroView.id}.json`),JSON.stringify(result.stageZeroView,null,2));
      await page.screenshot({path:path.join(outputDir,`Scene_P012StageZero_${result.stageZeroView.id}.png`)});
    }
    if(result.briefingView){
      await fs.writeFile(path.join(outputDir,`Data_P012_${result.briefingView.id}.json`),JSON.stringify(result.briefingView,null,2));
      await page.screenshot({path:path.join(outputDir,`Scene_P012_${result.briefingView.id}.png`)});
      Check(result.briefingView.subtitleClass?.includes("on")&&result.briefingView.rawSay.includes(result.briefingView.speech.text),
        "训话正在实际HUD显示而非仅事件已触发",result.briefingView.id);
    }
    if(result.trainView){
      await fs.writeFile(path.join(outputDir,`Data_P012Train_${result.trainView.id}.json`),JSON.stringify(result.trainView,null,2));
      await page.screenshot({path:path.join(outputDir,`Scene_P012Train_${result.trainView.id}.png`)});
    }
    if(result.spatialView){
      spatialCaptures.push(result.spatialView.id);
      await fs.writeFile(path.join(outputDir,`Data_P012Village_${result.spatialView.id}.json`),JSON.stringify(result.spatialView,null,2));
      await page.screenshot({path:path.join(outputDir,`Scene_P012Village_${result.spatialView.id}.png`)});
    }
    if(result.causality){
      await fs.writeFile(path.join(outputDir,`Data_P012${result.causality.id}.json`),JSON.stringify(result.causality,null,2));
      await page.screenshot({path:path.join(outputDir,`Scene_P012${result.causality.id}.png`)});
    }
    if (result.orientation) {
      orientations.push(result.orientation);
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Orientation${result.orientation.index + 1}.png`) });
    }
    if (result.trafficView) {
      await fs.writeFile(path.join(outputDir, `Data_P012Traffic_${result.trafficView.captureId}.json`), JSON.stringify(result.trafficView, null, 2));
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Traffic_${result.trafficView.captureId}.png`) });
    }
    console.log("P012 opening", JSON.stringify({ at: result.flow.elapsed, beat: result.flow.beat,
      route: result.flow.routeIndex, action: result.flow.action, position: result.position,
      guide: result.scene?.guidePosition, trafficReady: result.scene?.trafficReady }));
    if (result.stalled || !result.alive || result.flow.beatIndex >= 6) break;
  }
  Check(result.flow.beatIndex >= 6, "真实移动、领取枪弹、跟队与搬弹完成开场",
    result.flow.beatIndex >= 6 ? `${result.flow.elapsed.toFixed(1)}s` : JSON.stringify(result));
  Check(result.carry === null, "弹药实际交付后释放双手，能够拔枪");
  Check(result.scene.openingCast.length===6&&result.scene.openingCast.every(entry=>entry.shellStanceRestored&&entry.shellStanceRestoredAt!==null),
    "原六人炮后实际恢复行进姿态，不以永久卧姿慢爬拖住报数",JSON.stringify(result.scene.openingCast.map(entry=>({id:entry.actorId,previous:entry.shellPreviousStance,restoredAt:entry.shellStanceRestoredAt}))));
  Check(await page.evaluate(()=>!!window.p012ReviewBot.regroupCaptured&&!!window.p012ReviewBot.ammoDoglegCaptured),
    "实际玩家位置经历炮后全班报数与唯一一次狗腿沟搬弹");
  const briefingEvidence=await page.evaluate(()=>({captured:window.p012ReviewBot.briefingCaptured||[],inspection:window.p012ReviewBot.inspectionTrace||[]}));
  await fs.writeFile(path.join(outputDir,"Data_P012BriefingInspection.json"),JSON.stringify(briefingEvidence,null,2));
  Check(["p012_text_BriefingMission","p012_text_BriefingRoute","p012_text_BriefingReply"].every(key=>briefingEvidence.captured.includes(key)),"简短训话与两句行进交代各有实际在播截图");
  const stopped=briefingEvidence.inspection.filter(row=>row.inspection.endedAt==null),resumed=briefingEvidence.inspection.filter(row=>row.inspection.endedAt!=null);
  Check(stopped.length>2&&resumed.length>2,"路口检查有实际停步阶段与继续阶段");
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  Check(stopped.some((row,index)=>index>0&&row.at-stopped[index-1].at>0&&distance(row.guide,stopped[index-1].guide)<.015),"班长检查中实际停步");
  Check(resumed.some(row=>distance(row.guide,resumed[0].guide)>1),"检查结束后班长实际继续前进超过1m");
  Check(stopped.some(row=>{const dx=row.player[0]-row.guide[0],dz=row.player[2]-row.guide[2],length=Math.hypot(dx,dz);return length>.5&&(-Math.sin(row.yaw)*dx-Math.cos(row.yaw)*dz)/length>.7;}),"停步期间班长实际转向后方玩家（不是只记录检查信号）");
  if(spatialReview) Check(["SouthBend","MiddleCourt","NorthBend","HubReveal"].every(id=>spatialCaptures.includes(id)),
    "村路四处分段机位均来自正常行走，无摆拍替代");
  if(openingCausalityReview){
    const northEvidence=await page.evaluate(()=>({trace:window.p012ReviewBot.northEscortTrace||[],
      offsets:window.p012ReviewBot.impactOffsets||[],resting:!!window.p012ReviewBot.restingCaptured}));
    await fs.writeFile(path.join(outputDir,"Data_P012NorthEscort.json"),JSON.stringify(northEvidence,null,2));
    for(const beat of ["B03","B04","B05"]){
      const rows=northEvidence.trace.filter(row=>row.beat===beat);
      Check(rows.length>0&&rows.every(row=>row.people.length===6&&row.people.every(person=>person.alive)),
        "北上原六名队友真实存在并存活",beat);
      Check(rows.some(row=>row.people.every(person=>person.distanceToPlayer<=25)),"北上阶段六人实际在同行范围内",beat);
    }
    const first=northEvidence.trace[0],last=northEvidence.trace.at(-1);
    Check(first.people.every(person=>{
      const end=last.people.find(other=>other.actorId===person.actorId);
      return end&&Math.hypot(end.actualPosition[0]-person.actualPosition[0],end.actualPosition[2]-person.actualPosition[2])>10;
    }),"同一原六人从村口真实行进到前线，不用新演员替换");
    Check(northEvidence.resting&&northEvidence.trace.some(row=>row.resting?.count===3
      &&row.resting.people.length===3&&row.resting.people.every(person=>person.sit)),"路边三人实际坐姿快照");
    Check([0,.12,.4,1].every(offset=>northEvidence.offsets.includes(offset)),"近爆当帧及0.12/0.4/1秒真实相机取证齐全");
    const impact400=JSON.parse(await fs.readFile(path.join(outputDir,"Data_P012NorthImpact400ms.json"),"utf8"));
    const impact1000=JSON.parse(await fs.readFile(path.join(outputDir,"Data_P012NorthImpact1000ms.json"),"utf8"));
    Check(impact400.people.length===6&&impact1000.people.length===6&&impact400.people.every(person=>{
      const later=impact1000.people.find(other=>other.actorId===person.actorId);
      return person.stance===2&&later?.stance===2
        &&Math.hypot(later.actualPosition[0]-person.actualPosition[0],later.actualPosition[2]-person.actualPosition[2])<=.05;
    }),"近爆后0.4至1秒同六名队友实际卧倒并停步（不要求首帧瞬时完成动画）");
    const trafficEvidence=await page.evaluate(()=>({views:window.p012TrafficViews,captured:window.p012TrafficCapturedBeats}));
    await fs.writeFile(path.join(outputDir,"Data_P012OpeningTrafficEvidence.json"),JSON.stringify(trafficEvidence,null,2));
    Check(trafficEvidence.views.length>0&&trafficEvidence.views.every(view=>view.platformCivilians.length===0),
      "百姓不进入真实兵站站台矩形，不以全局零百姓代替空间验收");
    Check(trafficEvidence.views.some(view=>view.actors.some(actor=>actor.side===0&&actor.visible
      &&Math.hypot(actor.speedX,actor.speedZ)>.2)),"独立观察验收：北行军需组实际移动且进入玩家视野");
    Check(trafficEvidence.views.some(view=>{
      const visible=view.actors.filter(actor=>actor.role==="civilian"&&actor.visible&&Math.hypot(actor.speedX,actor.speedZ)>.2);
      return visible.length>=3&&Math.max(...visible.map(actor=>actor.distance))-Math.min(...visible.map(actor=>actor.distance))>=10;
    }),"独立观察验收：至少三名实际移动百姓形成远近纵列，不作为B02隐藏完成门");
    Check(["StationPlatform","StationNorthExit","VillageGroup"].every(id=>trafficEvidence.captured.includes(id)),
      "真实步行取得站台、兵站北口、村路群体玩家视角");
    const evidence=await page.evaluate(()=>({departure:!!window.p012ReviewBot.departureCaptured,chat:!!window.p012ReviewBot.chatCaptured,impact:!!window.p012ReviewBot.impactCaptured,
      ditch:!!window.p012ReviewBot.ditchCaptured,earlyProne:window.p012ReviewBot.earlyDitchNegative,
      emptyHands:!!window.p012ReviewBot.emptyHandsTested,rifle:!!window.p012ReviewBot.rifleCaptured,
      issued:!!window.p012ReviewBot.issueDepartureCaptured,unloadedMovement:!!window.p012ReviewBot.unloadedMovementCaptured}));
    Check(evidence.emptyHands&&evidence.rifle&&evidence.issued&&evidence.unloadedMovement,
      "空手封火、实际领枪领弹及不强制装弹的真实出发取证齐全");
    Check(evidence.departure&&evidence.chat&&evidence.impact&&evidence.ditch&&evidence.earlyProne&&!evidence.earlyProne.northCovered,
      "真实跟队北上、炮击、早路点低姿不算入沟及实际沟岸遮挡取证齐全",JSON.stringify(evidence));
  }
  if (orientationReview) {
    Check(orientations.length === 1, "村口真实跟随出发，无借镜或辨路门（可读性另行人工看图）");
    await fs.writeFile(path.join(outputDir, "Data_P012OrientationTrace.json"), JSON.stringify(orientations, null, 2));
  }
  await fs.writeFile(path.join(outputDir, "Data_P012OpeningTrace.json"), JSON.stringify(result, null, 2));
  if(stationReview) await VerifyStationDescent();
  await page.screenshot({ path: path.join(outputDir, "Scene_P012FirstContact.png") });
  const arrival = await page.evaluate(() => {
    const game=window.Tengxian,p=game.player.position,eye=game.player.EyePosition;
    const actors=game.ai.soldiers.filter(actor=>actor.alive&&actor.side==="nra").map(actor=>{
      const body=actor.position.clone().add({x:0,y:1.2,z:0}),screen=body.clone().project(game.camera);
      const dx=actor.position.x-p.x,dz=actor.position.z-p.z,distance=Math.hypot(dx,dz);
      const forward=(-Math.sin(game.player.yaw)*dx-Math.cos(game.player.yaw)*dz)/Math.max(distance,.001);
      return {id:actor.id,castId:actor.castId||null,position:actor.position.toArray(),goal:actor.goal.toArray(),
        distance,forward,screen:screen.toArray(),trafficSide:actor.p012TrafficSide??null,holdZone:actor.holdZone};
    });
    return {at:game.Debug.P012().elapsed,player:p.toArray(),eye:eye.toArray(),yaw:game.player.yaw,pitch:game.player.pitch,actors,
      scope:"first actual arrival after ammunition delivery; no actor/player/camera reposition or settle delay"};
  });
  await fs.writeFile(path.join(outputDir,"Data_P012FirstContactClearance.json"),JSON.stringify(arrival,null,2));
  Check(!arrival.actors.some(actor=>actor.distance<1.5&&actor.forward>.5),
    "首次交付后的正前方近距离没有友军身体堵住观察镜头",
    JSON.stringify(arrival.actors.filter(actor=>actor.distance<3)));
  console.log("P012 opening activity trace", JSON.stringify(result.trace));
}

async function PlayFrontline() {
  const fullCampaign = process.argv.includes("--campaign");
  const throughRoad = process.argv.includes("--through-road");
  const stopBeat = throughRoad ? 14 : fullCampaign ? 25 : 11;
  const recoverDeaths = process.argv.includes("--recover-deaths");
  const deaths = [];
  let result;
  let capturedBeat = -1;
  let capturedWindow = false;
  let capturedJointAirView = false;
  for (let chunk = 0; chunk < (fullCampaign ? 250 : 45); chunk += 1) {
    result = await page.evaluate(({ ports, fullCampaign, stopBeat, anchors, routes, retryDive, perception, spatial }) => {
      const game = window.Tengxian;
      const bot = window.p012CombatReview ||= { frame: 0, firstShotAt: null, trace: [], oldBeat: -1, shots: [], targetId: null, aimFrames: 0, held: {}, cleanupPoint: 0, lastProgress: 0, progressKey: "" };
      const TurnSalvage=(yaw,pitch)=>{
        const limit=(perception?.turnRadPerSecond ?? 1.5)/30;
        const delta=Math.atan2(Math.sin(yaw-game.player.yaw),Math.cos(yaw-game.player.yaw));
        game.player.yaw+=Math.max(-limit,Math.min(limit,delta));
        game.player.pitch+=Math.max(-limit,Math.min(limit,pitch-game.player.pitch));
        return Math.abs(Math.atan2(Math.sin(yaw-game.player.yaw),Math.cos(yaw-game.player.yaw)))<.025
          &&Math.abs(pitch-game.player.pitch)<.025;
      };
      const Key = (code, down) => {
        if (!!bot.held[code] === down) return;
        game.Debug.Key(code, down); bot.held[code] = down;
      };
      for (let frame = 0; frame < 600; frame += 1) {
        const flow = game.Debug.P012();
        if(bot.pendingScavengeCapture)break;
        if(window.p012PendingGuideView)break;
        if (window.p012JointAirView && !bot.jointAirViewCaptured) {
          bot.jointAirViewCaptured = true;
          break;
        }
        // Observer-only lateral/backward input is scoped to the aircraft turn.
        // Always release it before another objective, interaction or retry.
        Key("KeyS", false); Key("KeyA", false); Key("KeyD", false);
        const interactionId = flow.objective.interactionId || null;
        if (bot.interactionId !== interactionId) {
          Key("KeyF", false);
          bot.interactionId = interactionId;
        }
        if (Number.isFinite(bot.previousElapsed) && flow.elapsed < bot.previousElapsed - 1) {
          bot.rewindCount = (bot.rewindCount || 0) + 1;
          bot.forceMissDone = true;
        }
        bot.previousElapsed = flow.elapsed;
        if (flow.beatIndex >= 18) {
          const carry = game.carry.View(), hands = game.Debug.P012CarryView();
          const signature = [carry?.serial, carry?.phase, hands?.visible, hands?.releasing].join("|");
          if (bot.frame % 15 === 0 || bot.carryHandsSignature !== signature) {
            (bot.carryHands ||= []).push({ at: flow.elapsed, beat: flow.beat, attempt: bot.rewindCount || 0,
              carry: carry ? { kindId: carry.kindId, serial: carry.serial, phase: carry.phase, t: carry.t } : null,
              alive: game.player.Alive, hands });
          }
          bot.carryHandsSignature = signature;
        }
        // A broken retry must produce bounded, actionable evidence instead of repeating the whole beat forever.
        if ((bot.rewindCount || 0) >= 3) break;
        if (flow.beatIndex === 19 && bot.frame % 3 === 0) {
          const airState = game.Debug.Strafe.State();
          (bot.diveTrace ||= []).push({ at: flow.elapsed, attempt: bot.rewindCount || 0,
            position: game.player.position.toArray(), stance: game.player.stance,
            carry: game.carry.KindId, health: game.player.health,
            player: airState.run?.player, held: { ...bot.held },
            intentionalMiss: retryDive && !bot.forceMissDone });
        }
        if(flow.beatIndex===13&&bot.frame%15===0){
          (bot.roadContactTrace ||= []).push({at:flow.elapsed,player:game.player.position.toArray(),
            seen:flow.facts.includes("roadContactSeen"),held:flow.facts.includes("roadContactHeld"),
            visible:game.Debug.P012Scene().roadContactVisibleCount,
            enemies:game.ai.soldiers.filter(actor=>actor.p012RoadContact).map(actor=>({id:actor.id,
              alive:actor.alive,position:actor.position.toArray(),goal:actor.goal.toArray(),health:actor.health,
              state:actor.state,shots:actor.fireSequence,visible:actor.targetVisible,
              target:actor.target?.position?.toArray?.()||null}))});
        }
        if (flow.beatIndex >= stopBeat || !game.player.Alive) break;
        if (flow.beatIndex !== bot.oldBeat) {
          const scene = game.Debug.P012Scene();
          bot.trace.push({ at: flow.elapsed, beat: flow.beat,
            airRouteChoice:flow.airRouteChoice,facts:flow.facts.slice(),spawnedTotal:flow.spawnedTotal,
            lastLitterArrived: scene.lastLitterArrived, litterRecovered: scene.litterRecovered,
            lastLitterArrivedEvent: flow.signals.includes("P012LastLitterArrived"),
            woundedDragDistance: scene.woundedDragDistance, carryDistance: scene.carryDistance,
            originalLitter: scene.litters.find(litter => litter.originalCarried)?.id,
            ...(flow.beatIndex === 24 ? { litterParking: scene.litters.map(litter => ({
              id: litter.id, front: litter.front, rear: litter.rear,
            })) } : {}),
            aliveColumnCount: scene.columnActors.length });
          bot.oldBeat = flow.beatIndex;
          if (frame > 0) break;
        }
        // 飞机目标转移只有数秒：每2秒交回真实画面，避免20秒采样跨过整个转弯。
        if (flow.beatIndex >= 16 && flow.beatIndex <= 19 && frame >= 60) break;
        const progressKey = [flow.beat, flow.routeIndex, flow.retreatPoint, flow.spawnedTotal,
          game.Debug.P012Scene().nearEnemyDeaths, game.Debug.P012Scene().columnRouteIndex, flow.facts.join(",")].join("|");
        if (bot.progressKey !== progressKey) { bot.progressKey = progressKey; bot.lastProgress = flow.elapsed; }
        if (flow.elapsed - bot.lastProgress > 180) break;
        if (retryDive && flow.beatIndex === 19 && !bot.forceMissDone) {
          game.Debug.Mouse(2, false); Key("KeyW", false); Key("KeyF", false); Key("ShiftLeft", false);
          if (game.player.stance !== "stand") game.Debug.Key(game.player.stance === "prone" ? "KeyZ" : "KeyC");
          game.StepFrames(1, 1 / 30, false); bot.frame += 1;
          continue;
        }
        if (game.player.bleeding > 0 && game.player.bandages > 0) game.Debug.Key("KeyB");
        if(bot.salvageGrenade){
          Key("KeyW",false);Key("ShiftLeft",false);
          if(flow.elapsed>=bot.salvageGrenade.releaseAt){
            Key("KeyG",false);
            (bot.salvageActions ||= []).push({event:"grenadeReleased",at:flow.elapsed,
              from:game.player.position.toArray(),before:bot.salvageGrenade.before,after:game.state.grenades});
            bot.salvageGrenade=null;
          }
          game.StepFrames(1,1/30,false);bot.frame++;continue;
        }
        // Empty magazines are not a reason to repeat R forever. Discover only
        // nearby visible bodies, then walk and press the same contextual F as a
        // player. No item/weapon state or corpse coordinates are changed here.
        const canSalvage = [20, 21].includes(flow.beatIndex)
          && game.state.ammo === 0 && game.state.clips === 0 && !game.carry.Active;
        if (canSalvage) {
          const scav=bot.scavenge ||= {log:[],blocked:{},target:null,lastScan:-99};
          const eye=game.player.EyePosition;
          const bodies=game.ai.soldiers.filter(s=>!s.alive&&!s.unarmed&&s.drop&&!s.drop.taken&&s.weapon?.kind!=="melee");
          const Visible=s=>{
            const point=s.position.clone();point.y=game.battlefield.GroundHeight(point.x,point.z)+.35;
            const screen=point.clone().project(game.camera),delta=point.clone().sub(eye),distance=delta.length();
            if(distance>18||screen.z< -1||screen.z>1||Math.abs(screen.x)>.95||Math.abs(screen.y)>.95)return false;
            const hit=game.battlefield.Raycast(eye,delta.normalize(),distance);
            return !hit||hit.t>=distance-.05;
          };
          let corpse=bodies.find(s=>s.id===scav.target);
          if(!corpse){
            corpse=bodies.filter(s=>(scav.blocked[s.id]||-99)<flow.elapsed&&Visible(s))
              .sort((a,b)=>a.position.distanceTo(eye)-b.position.distanceTo(eye))[0];
            if(corpse){scav.target=corpse.id;scav.started=flow.elapsed;scav.lastSeen=flow.elapsed;scav.confirmFrames=0;
              scav.log.push({event:"discovered",at:flow.elapsed,id:corpse.id,weapon:corpse.drop.weaponId,
                corpse:corpse.position.toArray(),player:game.player.position.toArray()});}
          }
          if(corpse){
            const delta=corpse.position.clone().sub(game.player.position),distance=Math.hypot(delta.x,delta.z);
            const visible=Visible(corpse);
            if(visible){scav.lastSeen=flow.elapsed;scav.confirmFrames++;}else scav.confirmFrames=0;
            game.Debug.Mouse(2,false);Key("ShiftLeft",false);Key("KeyF",false);
            const linedUp=TurnSalvage(Math.atan2(-delta.x,-delta.z),-.45);
            if(game.player.stance!=="crouch")game.Debug.Key(game.player.stance==="prone"?"KeyZ":"KeyC");
            const query=game.interact.Query(game.player);
            if(query?.kind==="pickup"&&query.soldier===corpse&&visible&&linedUp
              &&scav.confirmFrames>=(perception?.confirmationFrames??23)&&!game.viewmodel.IsBusy?.()){
              Key("KeyW",false);
              const before={ammo:game.state.ammo,clips:game.state.clips,pickups:game.interact.pickups,taken:corpse.drop.taken};
              Key("KeyF",true);Key("KeyF",false);
              scav.log.push({event:"pickupInput",at:flow.elapsed,id:corpse.id,label:query.label,
                player:game.player.position.toArray(),corpse:corpse.position.toArray(),before,
                after:{ammo:game.state.ammo,clips:game.state.clips,pickups:game.interact.pickups,taken:corpse.drop.taken}});
              bot.pendingScavengeCapture=scav.log.at(-1);
              scav.target=null;
            }else if(flow.elapsed-scav.started>8||flow.elapsed-scav.lastSeen>4){
              Key("KeyW",false);scav.blocked[corpse.id]=flow.elapsed+30;scav.target=null;
              scav.log.push({event:"approachBlocked",at:flow.elapsed,id:corpse.id,distance,
                player:game.player.position.toArray(),corpse:corpse.position.toArray(),query:query?.kind||null,
                visible,confirmedFrames:scav.confirmFrames,reason:visible?"approachTimeout":"occludedOrMemoryExpired"});
            }else Key("KeyW",distance>1.25&&linedUp);
            game.StepFrames(1,1/30,false);bot.frame++;continue;
          }
          // Short, ordinary look scan; afterwards continue the public room route
          // rather than using knowledge of unseen corpse locations.
          if(flow.elapsed-scav.lastScan>6){scav.lastScan=flow.elapsed;scav.scanUntil=flow.elapsed+2;
            scav.log.push({event:"scan",at:flow.elapsed,player:game.player.position.toArray(),availableBodies:bodies.length,
              bodies:bodies.map(s=>({id:s.id,weapon:s.drop.weaponId,position:s.position.toArray(),visible:Visible(s)}))});}
          if(flow.elapsed<scav.scanUntil){
            Key("KeyW",false);Key("KeyF",false);Key("ShiftLeft",false);game.Debug.Mouse(2,false);
            TurnSalvage(game.player.yaw+(perception?.turnRadPerSecond??1.5)/30,-.35);
            game.StepFrames(1,1/30,false);bot.frame++;continue;
          }
        }
        // An actual window glance after clearing the interior firing pair.
        // Observe the moving litter through real collision/LOS; do not advance its path or facts.
        if (flow.beatIndex === 14 && flow.routeIndex >= 3 && !bot.windowView
          && Math.hypot(game.player.position.x - spatial.window.x, game.player.position.z - spatial.window.z) < 2
          && (bot.windowWatchFrames || 0) < 240) {
          const litter = game.Debug.P012Scene().litters[0];
          if (litter?.front && litter?.rear) {
            const aim = game.player.position.clone().set((litter.front.x + litter.rear.x) / 2, 1.1,
              (litter.front.z + litter.rear.z) / 2);
            game.Debug.Mouse(2, false); Key("KeyW", false); Key("ShiftLeft", false);
            if (game.player.stance !== "stand") game.Debug.Key(game.player.stance === "prone" ? "KeyZ" : "KeyC");
            const direction = aim.clone().sub(game.player.EyePosition), distance = direction.length();
            game.player.yaw = Math.atan2(-direction.x, -direction.z);
            game.player.pitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
            const hit = game.battlefield.Raycast(game.player.EyePosition, direction.normalize(), distance);
            const visible = !hit || hit.t > distance - 0.5;
            bot.windowWatchFrames = (bot.windowWatchFrames || 0) + 1;
            game.StepFrames(1, 1 / 30, false); bot.frame += 1;
            if (visible && bot.windowWatchFrames >= 20 && litter.front.z > 16) {
              bot.windowView = { at: flow.elapsed, player: game.player.position.toArray(),
                target: aim.toArray(), litter: litter.id, collisionClear: true };
              break;
            }
            continue;
          }
        }
        // 与屏幕手雷预警同源：真实移开，不站在落点上让战斗验收退化成木桩测试。
        const grenadeThreat = game.combat.GrenadeThreats(game.player.position)
          .find(threat => threat.fuse < 3.5 && threat.distance < threat.dangerRadius * 0.9);
        if (grenadeThreat && flow.beatIndex <= 21) {
          const dx = game.player.position.x - grenadeThreat.position.x;
          const dz = game.player.position.z - grenadeThreat.position.z;
          game.Debug.Mouse(2, false); Key("KeyF", false);
          if (game.player.stance !== "stand") game.Debug.Key(game.player.stance === "prone" ? "KeyZ" : "KeyC");
          game.player.yaw = Math.atan2(-dx, -dz);
          game.Debug.Key("KeyW", true); Key("ShiftLeft", true);
          game.StepFrames(1, 1 / 30, false); bot.frame += 1;
          continue;
        }
        if (flow.beatIndex <= 10 && flow.objective.interactionId === "p012_frontlineAmmo") {
          const point = game.interact.Point("p012_frontlineAmmo");
          const anchor = point.Anchor ? point.Anchor() : point.position;
          const dx = anchor.x - game.player.position.x, dz = anchor.z - game.player.position.z;
          const distance = Math.hypot(dx, dz);
          game.Debug.Mouse(2, false); Key("ShiftLeft", false);
          if (game.player.stance !== "crouch") game.Debug.Key("KeyC");
          game.player.yaw = Math.atan2(-dx, -dz); game.player.pitch = 0;
          Key("KeyW", distance > 1.5 && !bot.held.KeyF);
          const reachable = distance < 1.7 && game.interact.Query(game.player)?.point?.id === "p012_frontlineAmmo";
          Key("KeyF", reachable);
          if (reachable) Key("KeyW", false);
          game.StepFrames(1, 1 / 30, false); bot.frame += 1;
          continue;
        }
        let destination = null;
        if (flow.beatIndex === 6 || flow.beatIndex === 7) destination = flow.objective.target || ports[1];
        if (flow.beatIndex === 8) destination = flow.objective.target || ports[2];
        if (flow.beatIndex === 9) destination = flow.objective.target || ports[1];
        if (flow.beatIndex === 10) destination = flow.objective.target || ports[0];
        if (destination && flow.beatIndex <= 10 && flow.objective.requiredAction !== "move") destination = { x: destination.x, z: destination.z - 0.8 };
        if (flow.beatIndex >= 11) {
          const objective = flow.objective;
          const point = objective.interactionId && game.interact.Point(objective.interactionId);
          const anchor = point && (point.Anchor ? point.Anchor() : point.position);
          destination = anchor || objective.target;
          if (flow.beatIndex === 15 && !destination) destination = spatial.airRoad;
          const diveOpen = flow.beatIndex === 19 && game.Debug.Strafe.State().run?.player?.open;
          if (flow.beatIndex === 19) destination = { x: anchors.strafeSlots[0].x, z: anchors.strafeSlots[0].z + (diveOpen ? 0 : 1.8) };
          if (flow.beatIndex === 20 && !destination) destination = anchors.strafeSlots[0];
          if (flow.beatIndex === 22 && !destination) destination = spatial.southBlockade;
          const distance = destination ? Math.hypot(destination.x - game.player.position.x, destination.z - game.player.position.z) : Infinity;
          if (![13, 14, 18, 20, 21].includes(flow.beatIndex) || point || objective.requiredAction === "grenade" || objective.requiredAction === "follow") {
            game.Debug.Mouse(2, false);
            const arrive = flow.beatIndex===19 ? .2 : point ? 1.5 : objective.requiredAction === "follow"
              ? Math.max(0.1, Math.min(2.4, (objective.arrivalRadiusM ?? 2.45) - 0.05))
              : Math.min(0.9, (objective.arrivalRadiusM ?? 0.95) - 0.05);
            Key("KeyW", !!destination && distance > arrive && !bot.held.KeyF);
            Key("ShiftLeft", objective.requiredAction === "sprint" && !!destination && distance > arrive);
            if (destination && distance > 0.1) {
              game.player.yaw = Math.atan2(-(destination.x - game.player.position.x), -(destination.z - game.player.position.z));
              game.player.pitch = 0;
            }
            const strafeState = game.Debug.Strafe.State();
            const air = strafeState.modelAt;
            // A player can choose to track the five-second turn while backing
            // toward the public ditch objective. Use ordinary movement keys;
            // do not lock the production camera or move any actor directly.
            // Global frame-modulo glances previously missed the end of this
            // event when earlier travel changed by a fraction of a second.
            const observeTurn = flow.beatIndex === 17 && strafeState.run?.presetId === "crowdTurn"
              && strafeState.run?.phase === "approach";
            if ([16, 17].includes(flow.beatIndex) && air
              && (observeTurn || !destination || distance <= arrive || bot.frame % 90 < 30)) {
              Key("KeyW", false);
              const eye = game.player.EyePosition;
              game.player.yaw = Math.atan2(-(air.x - eye.x), -(air.z - eye.z));
              game.player.pitch = Math.atan2(air.y - eye.y, Math.hypot(air.x - eye.x, air.z - eye.z));
              if (observeTurn && destination && distance > arrive && !bot.held.KeyF) {
                const dx = (destination.x - game.player.position.x) / distance;
                const dz = (destination.z - game.player.position.z) / distance;
                const sine = Math.sin(game.player.yaw), cosine = Math.cos(game.player.yaw);
                const forward = -(dx * sine + dz * cosine), right = dx * cosine - dz * sine;
                Key("KeyW", forward > 0.25); Key("KeyS", forward < -0.25);
                Key("KeyD", right > 0.25); Key("KeyA", right < -0.25);
              }
            }
            if (flow.beatIndex === 22 && objective.requiredAction === "observe" && objective.lookAt) {
              const target = objective.lookAt;
              const eye = game.player.EyePosition;
              const point = eye.clone().set(target.x, game.battlefield.GroundHeight(target.x,target.z)+1.2, target.z);
              const sight = point.sub(eye), range = sight.length();
              const hit = game.battlefield.Raycast(eye, sight.normalize(), range);
              // The public observation goal already means we reached the
              // decision area. Look from clear cover instead of walking into
              // Luo merely because his position is also the follow target.
              if (!hit || hit.t >= range - .5) {
                Key("KeyW", false);
                game.player.yaw = Math.atan2(-(target.x - game.player.position.x), -(target.z - game.player.position.z));
                game.player.pitch = 0;
              }
            }
            const crouching = (flow.beatIndex === 23 && objective.requiredAction === "crouch" && distance < 3)
              || diveOpen;
            const stance = diveOpen ? "prone" : objective.requiredStance || (crouching ? "crouch" : "stand");
            if (game.player.stance !== stance) game.Debug.Key(stance === "prone" || game.player.stance === "prone" ? "KeyZ" : "KeyC");
            if (point && distance < 1.7 && game.interact.Query(game.player)?.point?.id === objective.interactionId) {
              Key("KeyW", false); Key("KeyF", true);
            } else Key("KeyF", false);
            if (objective.requiredAction === "grenade" && distance < 1.7 && objective.lookAt
              && flow.elapsed - (bot.lastGrenadeAt || 0) > 9) {
              const target = objective.lookAt;
              Key("KeyW", false);
              game.player.yaw = Math.atan2(-(target.x - game.player.position.x), -(target.z - game.player.position.z));
              game.player.pitch = 0;
              game.Debug.Key("KeyG"); bot.lastGrenadeAt = flow.elapsed;
            }
            if (objective.requiredAction === "reload" && distance < 2.7 && bot.frame % 60 === 0) game.Debug.Key("KeyR");
            game.StepFrames(1, 1 / 30, false); bot.frame += 1;
            continue;
          }
        }
        Key("KeyF", false);
        if (destination && Math.hypot(destination.x - game.player.position.x, destination.z - game.player.position.z)
          > (flow.beatIndex <= 10 ? 0.35 : [14, 18, 21].includes(flow.beatIndex)
            ? Math.max(0.1, (flow.objective.arrivalRadiusM ?? 0.6) - 0.05) : 1)) {
          game.Debug.Mouse(2, false);
          Key("ShiftLeft", flow.objective.requiredAction === "sprint");
          game.player.yaw = Math.atan2(-(destination.x - game.player.position.x), -(destination.z - game.player.position.z));
          game.Debug.Key("KeyW", true);
          const stance = flow.beatIndex <= 10
            ? (flow.objective.requiredAction === "sprint" ? "stand"
              : flow.objective.requiredStance === "prone" ? "prone" : "crouch")
            : flow.objective.requiredStance || "stand";
          if (game.player.stance !== stance) game.Debug.Key(stance === "prone" || game.player.stance === "prone" ? "KeyZ" : "KeyC");
        } else {
          game.Debug.Key("KeyW", false);
          const behindCover = (flow.beatIndex <= 10 || [13, 14, 18, 20, 21].includes(flow.beatIndex))
            && (game.viewmodel.IsBusy?.() || (game.state.ammo === 0 && !canSalvage));
          const noLiveThreats = !game.ai.soldiers.some(soldier => soldier.alive && soldier.side === "ija");
          const stance = behindCover ? "prone" : noLiveThreats && flow.objective.requiredStance
            ? flow.objective.requiredStance : "stand";
          if (game.player.stance !== stance) game.Debug.Key(stance === "prone" || game.player.stance === "prone" ? "KeyZ" : "KeyC");
          const eye = game.player.EyePosition.clone();
          const candidates = [];
          for (const soldier of game.ai.soldiers) {
            if (!soldier.alive || soldier.side !== "ija") continue;
            if (perception) {
              const screen = soldier.position.clone().add({ x: 0, y: 1.2, z: 0 }).project(game.camera);
              if (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 0.95 || Math.abs(screen.y) > 0.95) continue;
            }
            const shapes = soldier.actor?.GetBoneHitboxes?.() || [];
            // A head visibly exposed above a parapet remains a perceptible target;
            // refusing it would test an artificial inability to recognize heads.
            // The precision fixture used to keep selecting the low torso behind
            // the distant MG parapet after many visible misses. Prefer the
            // exposed head for long shots; still require live LOS/hitboxes and
            // use ordinary trigger, spread and damage (never write enemy health).
            const parts=!perception && soldier.position.distanceTo(eye)>60 ? ["head","torso"] : ["torso","head"];
            for (const part of parts) {
              const shape = shapes.find(item => item.part === part);
              if (!shape) continue;
              const aim = ["sphere", "ellipsoid"].includes(shape.type) ? shape.center.clone()
                : shape.start.clone().add(shape.end).multiplyScalar(0.5);
              const direction = aim.clone().sub(eye), distance = direction.length(); direction.normalize();
              const obstacle = game.battlefield.Raycast(eye, direction, distance);
              if (obstacle && obstacle.t < distance - 0.4) continue;
              if (!soldier.actor.RaycastHitboxes(eye, direction, distance + 0.5)) continue;
              if (game.ai.soldiers.some(ally => ally.alive && ally.side === "nra"
                && ally.actor?.RaycastHitboxes?.(eye, direction, distance - 0.6))) continue;
              candidates.push({ soldier, aim, distance, part });
              break;
            }
          }
          candidates.sort((a, b) => a.distance - b.distance);
          const chosen = candidates[0];
          if(canSalvage&&chosen
            &&chosen.distance>=5&&chosen.distance<18&&game.state.grenades>0&&!game.viewmodel.IsBusy?.()
            &&flow.elapsed-(bot.lastSalvageGrenadeAt||-99)>10){
            // A genuinely visible live target, not the stale generic grenade
            // marker. G holds/releases the production fuse and trajectory.
            const delta=chosen.aim.clone().sub(eye);
            game.Debug.Mouse(2,false);Key("ShiftLeft",false);Key("KeyW",false);
            if(bot.salvageAimTarget!==chosen.soldier.id){bot.salvageAimTarget=chosen.soldier.id;bot.salvageAimFrames=0;}
            bot.salvageAimFrames++;
            const linedUp=TurnSalvage(Math.atan2(-delta.x,-delta.z),-.15);
            if(!linedUp||bot.salvageAimFrames<(perception?.confirmationFrames??23)){
              game.StepFrames(1,1/30,false);bot.frame++;continue;
            }
            Key("KeyG",true);
            if(game.state.cooking){bot.salvageGrenade={releaseAt:flow.elapsed+.45,before:game.state.grenades};
              bot.lastSalvageGrenadeAt=flow.elapsed;
              (bot.salvageActions ||= []).push({event:"grenadeHeld",at:flow.elapsed,target:chosen.soldier.id,
                targetPosition:chosen.soldier.position.toArray(),from:game.player.position.toArray(),distance:chosen.distance});}
            game.StepFrames(1,1/30,false);bot.frame++;continue;
          }
          bot.salvageAimTarget=null;bot.salvageAimFrames=0;
          if (perception) {
            // LOS-visible enemies inside the current view may be remembered only
            // while visible. Public objectives tell us where to scan, not where to hit.
            const Turn = (yaw, pitch) => {
              const max = perception.turnRadPerSecond / 30;
              const delta = Math.atan2(Math.sin(yaw - game.player.yaw), Math.cos(yaw - game.player.yaw));
              game.player.yaw += Math.max(-max, Math.min(max, delta));
              game.player.pitch += Math.max(-max, Math.min(max, pitch - game.player.pitch));
            };
            if (chosen) {
              if (bot.targetId !== chosen.soldier.id) { bot.targetId = chosen.soldier.id; bot.aimFrames = 0; }
              bot.aimFrames += 1;
              const aim = chosen.aim.clone().sub(eye);
              const errorYaw = Math.sin(flow.elapsed * 1.7 + chosen.soldier.id) * perception.errorRad;
              const errorPitch = Math.cos(flow.elapsed * 1.1 + chosen.soldier.id) * perception.errorRad;
              const yaw = Math.atan2(-aim.x, -aim.z) + errorYaw;
              const pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z)) + errorPitch;
              Turn(yaw, pitch);
              const linedUp = Math.abs(Math.atan2(Math.sin(yaw - game.player.yaw), Math.cos(yaw - game.player.yaw))) < 0.025
                && Math.abs(pitch - game.player.pitch) < 0.025;
              game.Debug.Mouse(2, bot.aimFrames >= perception.confirmationFrames);
              Key("ShiftLeft", game.player.ads > 0.95 && !behindCover);
              if (linedUp && bot.aimFrames >= perception.confirmationFrames && game.player.ads > 0.95
                && !game.viewmodel.IsBusy?.() && game.state.ammo > 0
                && flow.elapsed - (bot.lastPerceptionShotAt ?? -Infinity) >= perception.shotIntervalS) {
                const before = game.state.ammo;
                game.Debug.Fire();
                if (game.state.ammo < before) {
                  bot.lastPerceptionShotAt = flow.elapsed;
                  if (bot.firstShotAt === null) bot.firstShotAt = flow.elapsed;
                  bot.shots.push({ at: flow.elapsed, distance: chosen.distance, part: chosen.part,
                    aim: chosen.aim.toArray(), enemy: chosen.soldier.position.toArray(), ...game.Debug.LastShot() });
                }
              }
            } else {
              bot.targetId = null; bot.aimFrames = 0;
              game.Debug.Mouse(2, false); Key("ShiftLeft", false);
              const look = flow.objective.lookAt;
              const base = look ? Math.atan2(-(look.x - eye.x), -(look.z - eye.z)) : 0;
              Turn(base + Math.sin(flow.elapsed * 0.35) * 1.1, 0);
            }
            if (game.state.ammo === 0 && !game.viewmodel.IsBusy?.()) game.Debug.Key("KeyR");
            game.StepFrames(1, 1 / 30, false); bot.frame += 1;
            continue;
          }
          game.Debug.Mouse(2, !!chosen);
          Key("ShiftLeft", !!chosen && game.player.ads > 0.95 && !behindCover);
          if (chosen) {
            if (bot.targetId !== chosen.soldier.id) { bot.targetId = chosen.soldier.id; bot.aimFrames = 0; }
            bot.aimFrames += 1;
            const aim = chosen.aim.clone().sub(eye);
            // 近距聚集的涵洞兵可以用现有有限投掷物处理；按键走真实弹道/引信/伤害。
            const grouped = candidates.filter(candidate => candidate.soldier.position.distanceTo(chosen.soldier.position) < 5).length;
            if (flow.beatIndex === 10 && chosen.distance >= 8 && chosen.distance < 19
              && grouped >= 2 && game.state.grenades > 0 && flow.elapsed - (bot.lastGrenadeAt || 0) > 9
              && !game.viewmodel.IsBusy?.()) {
              game.player.yaw = Math.atan2(-aim.x, -aim.z);
              game.player.pitch = chosen.distance < 12 ? -0.18 : 0;
              game.Debug.Key("KeyG"); bot.lastGrenadeAt = flow.elapsed;
            }
            game.player.yaw = Math.atan2(-aim.x, -aim.z) - game.player.aimYaw;
            // Precision follows the actual aim axis, with no compensation for
            // recoil from a shot that has not yet left the muzzle.
            game.player.pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z)) - game.player.aimPitch;
            // After lining up a close-range peek, shoot when the production
            // weapon is ready; do not stand exposed waiting for a test clock.
            if ((flow.beatIndex <= 10 ? bot.frame % 60 === 0 : true)
              && bot.aimFrames > 18 && game.player.ads > 0.95 && !game.viewmodel.IsBusy?.() && game.state.ammo > 0) {
              const before = game.state.ammo;
              game.Debug.Fire();
              if (game.state.ammo < before) {
                if (bot.firstShotAt === null) bot.firstShotAt = flow.elapsed;
                bot.shots.push({ at: flow.elapsed, distance: chosen.distance, part: chosen.part,
                  aim: chosen.aim.toArray(), enemy: chosen.soldier.position.toArray(), ...game.Debug.LastShot() });
              }
            }
          } else { bot.targetId = null; bot.aimFrames = 0; }
          if (game.state.ammo === 0 && game.state.clips > 0 && !game.viewmodel.IsBusy?.()) game.Debug.Key("KeyR");
        }
        game.StepFrames(1, 1 / 30, false); bot.frame += 1;
      }
      for (const code of Object.keys(bot.held)) Key(code, false);
      game.Debug.Key("KeyW", false); game.Debug.Mouse(2, false); game.StepFrames(1);
      return { flow: game.Debug.P012(), scene: game.Debug.P012Scene(), health: game.player.health,
        activity: window.p012ActivityTrace || [],
        carryHands: bot.carryHands || [],
        airViews: window.p012AirViews || [], crowdFireCues: window.p012CrowdFireCues || [], airGroundShots: window.p012AirGroundShots || [],
        airImpacts: window.p012AirImpacts || [],
        escortApproval: window.p012EscortApproval || [],
        prematureEscortMovement: window.p012PrematureEscortMovement || [],
        southGrenadeExplosions: window.p012SouthGrenadeExplosions || [],
        scavenging: bot.scavenge?.log || [],
        guideView:window.p012PendingGuideView?(()=>{const view=window.p012PendingGuideView;window.p012PendingGuideView=null;return view;})():null,
        scavengeCapture:bot.pendingScavengeCapture?(()=>{const capture=bot.pendingScavengeCapture;bot.pendingScavengeCapture=null;return capture;})():null,
        salvageActions: bot.salvageActions || [],
        jointAirView: window.p012JointAirView || null,
        windowView: bot.windowView || null,
        damageTrace: window.p012DamageTrace || [],
        bleeding: game.player.bleeding, bandages: game.player.bandages,
        companions: game.ai.soldiers.filter(s => s.side === "nra" && s.castId).map(s => ({
          id: s.castId, alive: s.alive, health: s.health, position: s.position.toArray(),
          state: s.state, order: s.order, scripted: s.p012Guided, defense: s.scriptDefensive })),
        position: game.player.position.toArray(), ammo: game.state.ammo, clips: game.state.clips,
        firstShotAt: bot.firstShotAt, perceptionProfile: perception, rewindCount: bot.rewindCount || 0, diveTrace: bot.diveTrace || [],
        trace: bot.trace, roadContactTrace:bot.roadContactTrace||[], hits: game.Debug.Hits(), shots: bot.shots,
        carry: game.carry.KindId, strafe: game.Debug.Strafe.State(), interact: game.Debug.Interact(),
        stalled: game.Debug.P012().elapsed - bot.lastProgress > 180 || (bot.rewindCount || 0) >= 3,
        enemies: game.ai.soldiers.filter(s => s.alive && s.side === "ija").map(s => ({
          position: s.position.toArray(), health: s.health, state: s.state, goal: s.goal.toArray() })) };
    }, { ports: P012_ANCHORS.gunports, fullCampaign, stopBeat, anchors: P012_ANCHORS, routes: P012_ROUTES,
      retryDive: process.argv.includes("--retry"), perception: perceptionProfile,
      spatial:{window:P012SouthPoint(68,24),airRoad:P012SouthPoint(50,68),southBlockade:P012SouthPoint(42,98)} });
    if(result.scavengeCapture){
      await fs.writeFile(path.join(outputDir,"Data_P012Scavenging.json"),JSON.stringify(result.scavenging,null,2));
      await page.screenshot({path:path.join(outputDir,`Scene_P012Scavenge${result.scavengeCapture.id}_${Math.round(result.flow.elapsed*10)}.png`)});
    }
    if(result.guideView){
      await fs.writeFile(path.join(outputDir,`Data_P012${result.guideView.id}.json`),JSON.stringify(result.guideView,null,2));
      await page.screenshot({path:path.join(outputDir,`Scene_P012${result.guideView.id}.png`)});
    }
    console.log("P012 frontline", JSON.stringify({ at: result.flow.elapsed, beat: result.flow.beat,
      health: result.health, ammo: result.ammo, clips: result.clips, position: result.position,
      enemies: result.enemies.length, dead: result.scene.nearEnemyDeaths, firstShotAt: result.firstShotAt,
      action: result.flow.action, carry: result.carry, route: result.flow.routeIndex, returnPoint: result.flow.retreatPoint,
      column: result.scene.columnPosition }));
    if (capturedBeat !== result.flow.beatIndex) {
      capturedBeat = result.flow.beatIndex;
      await page.screenshot({ path: path.join(outputDir, `Scene_P012${result.flow.beat}.png`) });
    }
    if (result.windowView && !capturedWindow) {
      capturedWindow = true;
      await page.screenshot({ path: path.join(outputDir, "Scene_P012WindowLitterResponse.png") });
    }
    if (result.jointAirView && !capturedJointAirView) {
      capturedJointAirView = true;
      await page.screenshot({ path: path.join(outputDir, "Scene_P012AircraftAndCivilians.png") });
    }
    if (result.flow.beatIndex >= 16 && result.flow.beatIndex <= 19) {
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Air${Math.round(result.flow.elapsed * 10)}.png`) });
    }
    if ([14, 20, 21, 23, 24].includes(result.flow.beatIndex)) {
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Combat${result.flow.beat}_${Math.round(result.flow.elapsed * 10)}.png`) });
    }
    if (result.health <= 0 && recoverDeaths && deaths.length < 4) {
      // Exercise the visible player-only retry. Never erase the death record,
      // replenish ammunition, restore enemies or rewind the campaign ourselves.
      deaths.push({ at: result.flow.elapsed, beat: result.flow.beat, position: result.position,
        ammo: result.ammo, clips: result.clips, carry: result.carry,
        damageTrace: result.damageTrace, routeIndex: result.flow.routeIndex });
      await fs.writeFile(path.join(outputDir, "Data_P012OrdinaryDeaths.json"), JSON.stringify(deaths, null, 2));
      await page.locator('#menu button[data-act="retrySandbox"]').click();
      const recovery = await page.evaluate(() => {
        const game = window.Tengxian;
        const bot = window.p012CombatReview;
        bot.lastProgress = game.Debug.P012().elapsed;
        bot.targetId = null; bot.aimFrames = 0;
        return { alive: game.player.Alive, elapsed: game.Debug.P012().elapsed,
          ammo: game.state.ammo, clips: game.state.clips, position: game.player.position.toArray() };
      });
      Check(recovery.alive && recovery.ammo === result.ammo && recovery.clips === result.clips
        && Math.abs(recovery.elapsed - result.flow.elapsed) < 0.1,
      "普通死亡通过可见菜单继续，保留战场时间与弹药", JSON.stringify(recovery));
      continue;
    }
    if (result.flow.beatIndex >= stopBeat || result.health <= 0 || result.stalled) break;
  }
  result.ordinaryDeaths = deaths;
  result.airTurnEvidence = AirTurnEvidence(result.airViews);
  await fs.writeFile(path.join(outputDir, "Data_P012GameplayTrace.json"), JSON.stringify(result, null, 2));
  // Save the evidence before assertions: a failed distance/camera gate must not
  // discard pacing and idle-time diagnostics from a completed playthrough.
  if (fullCampaign) {
    const totals = {};
    for (const span of result.activity) totals[span.kind] = (totals[span.kind] || 0) + span.to - span.from;
    const stationaryOverEightSeconds = result.activity.filter(span => span.kind === "stationary" && span.to - span.from > 8);
    console.log("P012 measured activity (observational, not a first-player pacing verdict)", JSON.stringify({totals, stationaryOverEightSeconds}));
    await fs.writeFile(path.join(outputDir, "Data_P012ActivityTrace.json"), JSON.stringify({
      definitions: { combat: "Actual shot within 3 seconds by player, or enemy firing at player/ally within 12m; not merely a living enemy.",
        moving: "Actual horizontal displacement while not actively engaged.",
        interaction: "Production interaction hold while stationary and not engaged.",
        weaponAction: "Production weapon busy cycle (bolt/reload) while stationary and not engaged.",
        observation: "An actual increase of the same public observation progress counter; a look target alone is not evidence.",
        milestone: "A production beat, fact or signal changed while otherwise inactive.",
        stationary: "No measured movement, engagement, interaction, weapon cycle or objective progress; includes narration and requires manual review." },
      totals, stationaryOverEightSeconds, spans: result.activity,
    }, null, 2));
  }
  if(throughRoad){
    const firstSeen=result.roadContactTrace.find(sample=>sample.seen);
    await fs.writeFile(path.join(outputDir,"Data_P012RoadContact.json"),JSON.stringify({
      scope:"sequential B00 through B13 only; ordinary deaths retained; not a full campaign or first-play pacing verdict",
      trace:result.roadContactTrace,firstSeen,ordinaryDeaths:deaths},null,2));
    Check(result.flow.beatIndex>=14,"从下车顺序完成护送路口段",`${result.flow.beat} at ${result.flow.elapsed.toFixed(2)}s`);
    Check(firstSeen?.enemies.some(actor=>actor.alive),"实际到路口时仍有活敌接战，未在村西被友军提前清空",JSON.stringify(firstSeen));
    Check(["roadContactSeen","roadContactHeld","roadContactClear","roadContactReleased"].every(fact=>result.flow.facts.includes(fact)),
      "真实叫停、接敌、清除与队尾放行完成");
    return;
  }
  Check(result.flow.beatIndex >= (fullCampaign ? 25 : 11), fullCampaign ? "整关真实输入顺序通关" : "有限前线五波可由真实操作完成",
    `${result.flow.beat} at ${result.flow.elapsed.toFixed(1)}s; health ${result.health}; ${path.join(outputDir, "Data_P012GameplayTrace.json")}`);
  Check(result.firstShotAt !== null, "玩家实际参与射击而非全靠友军清场", String(result.firstShotAt));
  const northHandoff=await page.evaluate(()=>window.p012GuidanceHudTrace.filter(sample=>/^B0[5-9]$|^B10$/.test(sample.beat)));
  const marchIds=[...new Set(northHandoff.flatMap(sample=>sample.cast.map(entry=>entry.actorId)))];
  Check(marchIds.length===6&&marchIds.every(id=>northHandoff.some(sample=>sample.cast.some(entry=>
    entry.actorId===id&&entry.marchComplete&&entry.stage==="frontline"&&entry.defense
      &&Math.hypot(entry.position.x-entry.defense.x,entry.position.z-entry.defense.z)<.9))),
    "原六名同班军人实际抵达各自前沿侧位并交接防守，不在村口或交通壕消失",
    JSON.stringify(northHandoff.at(-1)?.cast));
  Check(result.flow.frontlineAmmo.remainingClips >= 0 && result.flow.spawnedTotal <= 37,
    "弹药与近敌保持有限预算");
  const tacticalPressures = result.flow.pressureHistory.filter(entry => ["machineGun", "mortar", "culvert"].includes(entry.kind));
  Check(tacticalPressures.length === 3 && tacticalPressures.every(entry => entry.interval >= 29.99),
    "机枪、掷弹筒、涵洞三种新压力不因快清敌而密集叠加", JSON.stringify(tacticalPressures));
  if (fullCampaign && process.argv.includes("--retry")) Check(result.rewindCount >= 1,
    "故意错过首次扑救后真实回退并继续通关", `${result.rewindCount}次`);
  if (fullCampaign) {
    const firstRoadSeen=result.roadContactTrace.find(sample=>sample.seen);
    Check(firstRoadSeen?.enemies.some(actor=>actor.alive),"顺序跟队到路口时仍有活敌接战",JSON.stringify(firstRoadSeen));
    Check(["roadContactSeen", "roadContactHeld", "roadContactClear", "roadContactReleased"].every(fact => result.flow.facts.includes(fact)),
      "浏览器实跑完成识别道路敌情、叫停、清场与队尾放行闭环", JSON.stringify(result.flow.facts));
    const requested = result.escortApproval.find(entry => entry.event === "P012EscortRequested");
    const spoken = result.escortApproval.find(entry => entry.event === "LuoApprovalStarted");
    const approved = result.escortApproval.find(entry => entry.event === "P012EscortApproved");
    const departed = result.escortApproval.find(entry => entry.event === "EscortCall");
    Check(requested && spoken && approved && departed && requested.at <= spoken.at
      && approved.at >= spoken.at + (spoken.duration || 0) - 0.04 && approved.at <= departed.at
      && result.prematureEscortMovement.length === 0,
    "实际请求、批准语音时长／字幕占用结束、担架启程按因果先后发生", JSON.stringify(result.escortApproval));
    const grenadeEffect = result.flow.lastSouthGrenadeEffect;
    Check(!result.flow.facts.includes("southGrenadeThrown") || (grenadeEffect?.damage > 0
      && result.southGrenadeExplosions.some(entry => entry.effect?.targetId === grenadeEffect.targetId
        && entry.effect.damage > 0)),
    "南路手雷事实只由真实爆炸作用产生；步枪清场不冒称投掷成功",
    JSON.stringify({ effect: grenadeEffect, explosions: result.southGrenadeExplosions }));
    await page.waitForFunction(() => {
      const menu = document.querySelector("#menu.p012Complete");
      return menu && getComputedStyle(menu).backgroundColor === "rgb(0, 0, 0)"
        && Number(getComputedStyle(menu).opacity) >= .99
        && [".mnTitle", ".mnList"].every(selector => {
          const element = menu.querySelector(selector);
          return element && getComputedStyle(element).visibility === "visible"
            && Number(getComputedStyle(element).opacity) >= .99;
        })
        && menu.innerText.includes("重新测试");
    }, null, { timeout: 6000 });
    const ending = await page.evaluate(() => {
      const game = window.Tengxian;
      const before = { elapsed: game.Debug.P012().elapsed, health: game.player.health,
        spawned: game.Debug.P012().spawnedTotal, level: game.story.levelId };
      game.StepFrames(300, 1 / 30, false);
      return { before, after: { elapsed: game.Debug.P012().elapsed, health: game.player.health,
        spawned: game.Debug.P012().spawnedTotal, level: game.story.levelId },
        scene: game.Debug.P012Scene(), complete: game.Debug.P012().complete,
        endingText: document.body.innerText };
    });
    Check(ending.complete && ending.endingText.includes("测试关卡完成")
      && ending.endingText.includes("重新测试") && ending.endingText.includes("返回主菜单"),
    "独立测试完成后提供重玩和返回主菜单");
    Check(JSON.stringify(ending.before) === JSON.stringify(ending.after),
      "终局停止敌军、伤害和剧情推进，不误入第二章");
    // Regrip preparation deliberately lowers the original litter, so the live
    // "all still carried at parking slots" predicate is no longer true in B24.
    // Require the prior production arrival event plus the actual parking geometry below.
    Check(result.trace.some(entry => entry.beat === "B24" && entry.lastLitterArrivedEvent)
      && ending.scene.woundedDragDelivered,
      "真实伤员拖行与最后担架抵达均已发生");
    const firstLitter = result.trace.find(entry => entry.beat === "B19")?.originalLitter;
    const returnedLitter = result.trace.find(entry => entry.beat === "B24")?.originalLitter;
    Check(!!firstLitter && firstLitter === returnedLitter && ending.scene.litterRecovered,
      "扑救放下、扶起恢复、结尾重新握住的是同一副担架", firstLitter);
    const parked = result.trace.find(entry => entry.beat === "B24")?.litterParking || [];
    const spans = parked.map(litter => Math.hypot(litter.front.x - litter.rear.x, litter.front.z - litter.rear.z));
    const centers = parked.map(litter => ({ x: (litter.front.x + litter.rear.x) / 2,
      z: (litter.front.z + litter.rear.z) / 2 }));
    Check(parked.length === 2 && spans.every(span => span > 1.2 && span < 2.8)
      && Math.hypot(centers[0].x - centers[1].x, centers[0].z - centers[1].z) >= 3,
    "回撤停车仍保留两副担架及前后抬手间距", JSON.stringify(parked));
    Check(ending.scene.farSpawned === 4 && ending.scene.retreatPursuit.length === 2
      && ending.scene.retreatPursuit.every(entry => !entry.alive || entry.index > 1),
    "有限追兵已沿路线追击或被真实击毙，不复活补兵",
    JSON.stringify(ending.scene.retreatPursuit));
    Check(!!result.windowView?.collisionClear, "实际从破屋窗口看到前副担架移出院墙", JSON.stringify(result.windowView));
    Check(result.airViews.some(view => view.preset === "crowdTurn" && view.phase === "approach"
      && view.airVisible && view.bearersVisible >= 2 && view.civiliansVisible >= 1),
    "自由视角实际同屏看见飞机转向、担架员与平民道路");
    Check(result.airTurnEvidence.longestVisibleS>=4,
      "主动转向开火前，自由视角连续看见至少四秒真实航迹",JSON.stringify(result.airTurnEvidence));
    Check(result.trace.some(entry=>entry.beat==="B17"&&entry.airRouteChoice),
      "玩家从实体观察墙看完有限航迹后，以真实移动选择开放路或沟边路",JSON.stringify(result.trace));
    Check(result.trace.some(entry=>entry.beat==="B18"&&entry.facts.includes("airObstacleResolved")),
      "扫射后的真实百姓/小车阻碍必须经救人或清障分支处理",JSON.stringify(result.trace));
    Check(result.diveTrace.some(entry => entry.carry === "stretcher") && ending.scene.litterOverturned,
      "同一副担架抬在手里迎来俯冲，真实松手后侧翻，不能预先安全停放",
      JSON.stringify({dive:result.diveTrace,overturned:ending.scene.litterOverturned}));
    const heldHands=result.carryHands.filter(sample=>sample.alive&&sample.carry?.kindId==="stretcher"
      &&sample.carry.phase==="carry"&&sample.hands?.gripWeight>=.999);
    const originalId=ending.scene.litters.find(litter=>litter.originalCarried)?.id;
    Check(heldHands.some(sample=>sample.beat==="B18")&&heldHands.some(sample=>sample.beat==="B24")
      &&new Set(heldHands.map(sample=>sample.carry.serial)).size>=2
      &&heldHands.every(sample=>sample.hands.visible&&sample.hands.litterId===originalId
        &&["r","l"].every(side=>sample.hands.reachable[side]&&sample.hands.gripError[side]<=.006
          &&sample.hands.handTranslation[side]<=.006)),
      "真实搬运和结尾重新握持均抓住同一担架，两手连续可达且无断腕纠偏",
      JSON.stringify({samples:heldHands.length,originalId,maxError:Math.max(0,...heldHands.flatMap(sample=>Object.values(sample.hands.gripError)))}));
    Check(result.carryHands.every(sample=>sample.alive||!sample.hands?.visible)
      &&result.carryHands.some(sample=>sample.beat==="B20"&&!sample.carry&&!sample.hands?.visible),
      "死亡冻结及俯冲松手后双臂正确隐藏，不保留悬空握持");
    // A rifle shot during the aviation gun's existing 0.18s burst gap is still
    // overlapping pressure. Require real impacts within 0.25s in the same run;
    // merely seeing an egress aircraft, or a phase label without bullets, fails.
    const jointFire = result.airGroundShots.filter(shot => shot.preset === "divePress"
      && shot.phase === "strafe" && (shot.targetPlayer || shot.targetNearPlayer)
      && result.airImpacts.some(impact => impact.runId === shot.runId
        && impact.preset === "divePress" && Math.abs(impact.at - shot.at) <= 0.25));
    Check(jointFire.length > 0, "实际扫射弹着与地面枪响相隔不超过0.25秒，构成空地交叉压力", JSON.stringify(jointFire));
    await fs.writeFile(path.join(outputDir, "Data_P012EndingTrace.json"), JSON.stringify(ending, null, 2));
    await page.screenshot({ path: path.join(outputDir, "Scene_P012Ending.png") });
  }
  // Keep the same strict P0 bounds. Defer their failures until the outer HUD,
  // population, issue callbacks and browser-error checks have also run.
  pacingChecks.push({ passed: result.firstShotAt >= 270 && result.firstShotAt <= 330,
    label: "实际第一枪落在 P0 四分半至五分半窗口", detail: `${result.firstShotAt.toFixed(1)}s` });
  Check(result.shots[0]?.distance >= 44 && result.shots[0]?.distance <= 61,
    "中央枪眼首次交火距离约 45–60 米（含角色与枪眼边缘容差）", `${result.shots[0]?.distance?.toFixed(2)}m`);
  if (fullCampaign && process.argv.includes("--pacing")) {
    pacingChecks.push({ passed: result.flow.elapsed >= 23 * 60 && result.flow.elapsed <= 26 * 60,
      label: "整关实际时长落在 P0 目标", detail: `${(result.flow.elapsed / 60).toFixed(2)}min` });
  }
  await page.screenshot({ path: path.join(outputDir, "Scene_P012FrontlineAftermath.png") });
}

// Production director objectives + real player collision, isolated from the
// sequential campaign. Fixture setup may reset position; movement never does.
async function VerifySouthRouteRecoveryFixtures() {
  const results = await page.evaluate(async () => {
    const { FirstLevelP012Director } = await import("./Script_FirstLevelP012Flow.mjs");
    const { FIRST_LEVEL_P012_WHITEBOX_PHASE: phase } = await import("./Data_FirstLevelP012Whitebox.mjs");
    const game = window.Tengxian, results = [];
    for (const beat of [21, 22]) {
      const indices = beat === 21 ? [5, 6, 7] : [0, 1, 2, 3, 4];
      for (const routeIndex of indices) {
        const director = new FirstLevelP012Director({}, phase.whitebox);
        director.beat = beat; director.routeIndex = routeIndex;
        const destination = director.ActivityRoute()[routeIndex];
        const unchanged = JSON.stringify(director.Snapshot()), path = [];
        const start=phase.whitebox.anchors.strafeSlots[0];
        game.player.Spawn(start.x, start.z, 0);
        game.player.stance = "stand"; game.player.pitch = 0;
        let reached = false;
        for (let frame = 0; frame < 2400; frame++) {
          director.lastSample = { position: game.player.position };
          if (game.player.position.distanceTo(game.player.position.clone().set(destination.x, 0, destination.z)) < .6) {
            reached = true; break;
          }
          const objective = director.CurrentObjective(), target = objective.target;
          if (!target) break;
          game.player.yaw = Math.atan2(-(target.x - game.player.position.x), -(target.z - game.player.position.z));
          game.Debug.Key("KeyW", true);
          game.StepFrames(1, 1 / 30, false);
          if (frame % 30 === 0) path.push(game.player.position.toArray());
        }
        game.Debug.Key("KeyW", false);
        results.push({ beat, routeIndex, reached, position: game.player.position.toArray(),
          destination, path, preserved: unchanged === JSON.stringify(director.Snapshot()) });
      }
    }
    return results;
  });
  await fs.writeFile(path.join(outputDir, "Data_P012SouthRetryRoutes.json"), JSON.stringify(results, null, 2));
  for (const result of results) Check(result.reached && result.preserved,
    `B${result.beat} 路点${result.routeIndex}：从CP05按公开转角目标真实走回，任务进度不变`,
    JSON.stringify({ destination: result.destination, position: result.position }));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012SouthRetryArrival.png") });
}

async function VerifyFrontlineRecoveryFixtures() {
  const results = await page.evaluate(async () => {
    const { FirstLevelP012Director } = await import("./Script_FirstLevelP012Flow.mjs");
    const { FIRST_LEVEL_P012_WHITEBOX_PHASE: phase } = await import("./Data_FirstLevelP012Whitebox.mjs");
    const { P012NorthPoint } = await import("./Data_FirstLevelP012Space.mjs");
    const game = window.Tengxian, results = [];
    for (const beat of [6, 7, 8, 9, 10]) {
      const director = new FirstLevelP012Director({}, phase.whitebox);
      director.beat = beat;
      const destination = phase.whitebox.anchors.gunports[beat === 8 ? 2 : beat === 10 ? 0 : 1];
      const unchanged = JSON.stringify(director.Snapshot()), path = [];
      const start=P012NorthPoint(3.32966,-43.11849);
      game.player.Spawn(start.x, start.z, 0);
      game.player.stance = "prone"; game.player.pitch = 0;
      let reached = false;
      for (let frame = 0; frame < 3000; frame++) {
        director.lastSample = { position: game.player.position, clips: 1 };
        const objective = director.CurrentObjective();
        if (Math.hypot(destination.x - game.player.position.x, destination.z - game.player.position.z) < .6) {
          reached = true; break;
        }
        const target = objective.target;
        if (!target) break;
        game.player.yaw = Math.atan2(-(target.x - game.player.position.x), -(target.z - game.player.position.z));
        game.Debug.Key("KeyW", true);
        game.StepFrames(1, 1 / 30, false);
        if (frame % 30 === 0) path.push(game.player.position.toArray());
      }
      game.Debug.Key("KeyW", false);
      results.push({ beat, reached, position: game.player.position.toArray(), destination, path,
        preserved: unchanged === JSON.stringify(director.Snapshot()) });
    }
    return results;
  });
  await fs.writeFile(path.join(outputDir, "Data_P012FrontlineRetryRoutes.json"), JSON.stringify(results, null, 2));
  for (const result of results) Check(result.reached && result.preserved,
    `B${result.beat}：从CP01沿交通壕真实卧姿回枪眼，任务进度不变`,
    JSON.stringify({ destination: result.destination, position: result.position }));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012FrontlineRetryArrival.png") });
}

// Inspection fixture, not campaign movement or a natural gameplay camera claim.
async function VerifyCastClothing() {
  const cast = await page.evaluate(async () => {
    const { P012_CAST_CLOTH_COLORS: colors } = await import("./Script_FirstLevelP012CastAppearance.mjs");
    const game = window.Tengxian;
    return game.ai.soldiers.filter(soldier => soldier.castId).map(soldier => {
      const clothes = [], other = [];
      soldier.actor.characterRig.root.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          const entry = { name: material.name, color: material.color?.getHex(), map: !!material.map };
          (material.name.startsWith("P012Cloth_") ? clothes : other).push(entry);
        }
      });
      return { castId: soldier.castId, expected: colors[soldier.castId],
        applied: soldier.actor.p012ClothColor, clothes, other };
    });
  });
  Check(cast.length === 5 && new Set(cast.map(entry => entry.applied)).size === 5
    && cast.every(entry => entry.applied === entry.expected && entry.clothes.length > 0
      && entry.clothes.every(material => material.color === entry.expected && !material.map)
      && entry.other.some(material => material.map)),
  "五名具名NPC使用各自纯色衣服，仍保留原皮肤/装备贴图");
  for (const entry of cast) {
    const placement = await page.evaluate(castId => {
      const game = window.Tengxian, soldier = game.ai.soldiers.find(actor => actor.castId === castId);
      const before = { position: soldier.position.toArray(), goal: soldier.goal.toArray(), yaw: soldier.yaw,
        speed: soldier.scriptMoveSpeedMps ?? null, manualGoalUntil: soldier.manualGoalUntil };
      // Explicit appearance inspection stage: avoid the random initial squad
      // formation occluding a costume. This is not used by campaign acceptance.
      soldier.position.set(-50, 0, 60); soldier.body?.Teleport(-50, 0, 60);
      soldier.goal.set(-50, 0, 60); soldier.manualGoalUntil = game.ai.time + 5;
      soldier.scriptMoveSpeedMps = 0; soldier.yaw = Math.PI;
      game.player.Spawn(-50, 63.5, 0);
      game.player.stance = "stand"; game.player.pitch = -.1;
      game.StepFrames(2);
      return before;
    }, entry.castId);
    await page.screenshot({ path: path.join(outputDir, `Scene_P012Cast_${entry.castId}.png`) });
    await page.evaluate(({ castId, before }) => {
      const soldier = window.Tengxian.ai.soldiers.find(actor => actor.castId === castId);
      soldier.position.fromArray(before.position); soldier.body?.Teleport(...before.position);
      soldier.actor.root.position.copy(soldier.position); soldier.goal.fromArray(before.goal);
      soldier.yaw = before.yaw; soldier.manualGoalUntil = before.manualGoalUntil;
      if (before.speed === null) delete soldier.scriptMoveSpeedMps;
      else soldier.scriptMoveSpeedMps = before.speed;
    }, { castId: entry.castId, before: placement });
  }
  await fs.writeFile(path.join(outputDir, "Data_P012CastClothing.json"), JSON.stringify(cast, null, 2));
}

// Isolated real-trigger timing fixture, not a campaign or hit-rate measurement.
// It retains weapon spread and full recoil and never compensates aim for the
// shot that has not happened yet. The unspread axis must match the visible
// trigger-time aim; recoil must still move the camera after discharge.
async function VerifyTriggerAim() {
  const shots = await page.evaluate(() => {
    const game = window.Tengxian, records = [];
    game.player.Spawn(-103, 130, 0);
    game.player.pitch = 0.1;
    for (const ads of [false, true, true]) {
      game.Debug.Mouse(2, ads);
      game.StepFrames(180, 1 / 60, false);
      const before = { count: game.state.playerShots, pitch: game.player.pitch, yaw: game.player.yaw,
        aim: game.player.AimDirection().toArray(), ads: game.player.ads };
      game.Debug.Fire();
      const shot = game.Debug.LastShot();
      records.push({ ads, before, shot, fired: game.state.playerShots === before.count + 1,
        after: { pitch: game.player.pitch, yaw: game.player.yaw, pending: { ...game.player.recoilPending } } });
    }
    game.Debug.Mouse(2, false);
    return records;
  });
  const Angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, value, index) => sum + value * b[index], 0))));
  for (const record of shots) {
    record.triggerErrorRad = Angle(record.shot.aimAtTrigger, record.shot.aimDirection);
    record.postShotKickRad = Math.hypot(record.after.pitch - record.before.pitch, record.after.yaw - record.before.yaw);
    record.seventyMetreOffsetM = Math.tan(record.triggerErrorRad) * 70;
  }
  await fs.writeFile(path.join(outputDir, "Data_P012TriggerAim.json"), JSON.stringify(shots, null, 2));
  console.log("P012 trigger-time evidence", JSON.stringify(shots));
  Check(shots.every(record => record.fired), "腰射与开镜样本均走真实扳机，正常扣除弹药");
  Check(shots.every(record => record.postShotKickRad > 0.001), "本发射出后相机仍承受完整后坐");
  Check(shots.every(record => record.triggerErrorRad < 0.000001),
    "P012 本发散布中心与扣扳机前实际瞄准轴一致，不先吃尚未显示的后坐",
    shots.map(record => `${record.ads ? "ADS" : "hip"}: ${(record.triggerErrorRad * 180 / Math.PI).toFixed(4)}deg`).join(", "));
}

// Observation only: movement remains PlayPrelude's ordinary keyboard driver.
// Supplemental stair/platform photographs use an explicitly chosen player look.
async function CaptureStationView(view) {
  if(view.id==="Descent") {
    await page.screenshot({path:path.join(outputDir,"Scene_P012StationDescent.png")});
  }
  const saved=await page.evaluate(()=>({yaw:window.Tengxian.player.yaw,pitch:window.Tengxian.player.pitch}));
  const views=view.id==="Descent"
    ? [["DescentLookDown",null]]
    : [["TrainLookBack",{...P012StationPoint(-66,59),y:2}],["StationDistricts",{...P012StationPoint(-42,68),y:1.2}],
      ["TrainEngine",{...P012StationPoint(-66,31),y:2.3}]];
  try {
    for(const [id,point] of views) {
      const evidence=await page.evaluate(({id,point})=>{
        const game=window.Tengxian,eye=game.player.EyePosition;
        const look=point||{x:game.player.position.x+1.1,z:game.player.position.z,
          y:game.battlefield.GroundHeight(game.player.position.x+1.1,game.player.position.z)};
        game.player.yaw=Math.atan2(-(look.x-eye.x),-(look.z-eye.z));
        game.player.pitch=Math.atan2(look.y-eye.y,Math.hypot(look.x-eye.x,look.z-eye.z));
        game.StepFrames(1);
        return {id,at:game.Debug.P012().elapsed,player:game.player.position.toArray(),
          yaw:game.player.yaw,pitch:game.player.pitch,lookAt:look,scope:"player-controlled look only; no position/fact writes"};
      },{id,point});
      await page.screenshot({path:path.join(outputDir,`Scene_P012${id.startsWith("Station")?id:`Station${id}`}.png`)});
      await page.evaluate(evidence=>window.p012StationViews.push(evidence),evidence);
    }
  } finally {
    await page.evaluate(saved=>{const game=window.Tengxian;game.player.yaw=saved.yaw;game.player.pitch=saved.pitch;game.StepFrames(1);},saved);
  }
}

async function VerifyStationDescent() {
  const evidence=await page.evaluate(()=>({samples:window.p012StationTrace,views:window.p012StationViews,
    scope:"cold start and normal PlayPrelude input; photographs are observations, not production camera control"}));
  await fs.writeFile(path.join(outputDir,"Data_P012StationDescent.json"),JSON.stringify(evidence,null,2));
  const samples=evidence.samples||[],first=samples[0];
  const spawn=P012_ANCHORS.trainSpawn,door=P012_ANCHORS.trainDoor;
  Check(first&&Math.hypot(first.player.x-spawn.x,first.player.z-spawn.z)<.1
    &&Math.abs(first.player.y-P012_STATION_HEIGHTS.floorTop)<.08&&Math.abs(first.groundAt-P012_STATION_HEIGHTS.floorTop)<.001,
    "兵站出生脚底真实位于车厢1.25m地板",JSON.stringify(first));
  let cursor=0;
  for(const height of P012_STATION_HEIGHTS.exitTops) {
    const index=samples.findIndex((sample,i)=>i>cursor&&sample.player.x>-63.7&&sample.player.x<-59.5
      &&Math.abs(sample.player.z-door.z)<1.5&&Math.abs(sample.groundAt-height)<.001
      &&Math.abs(sample.player.y-height)<.1);
    Check(index>cursor,`真实脚底依次接触下车台阶${height}m`);
    cursor=index;
  }
  Check(samples.every((sample,i)=>!i||Math.hypot(sample.player.x-samples[i-1].player.x,
    sample.player.z-samples[i-1].player.z)<.6),"下车逐帧轨迹无位置跳变");
  Check(samples.some(sample=>sample.doorOpen)&&evidence.views.some(view=>view.id==="TrainLookBack")
    &&evidence.views.some(view=>view.id==="StationDistricts"),"真实开门、列车回看及兵站分区取证齐全");
}

// Physical scale audit: isolated straight corridor, no plot gating or combat.
// This measures a spatial traverse, not the length of a complete mission.
async function VerifyMapScale() {
  const report = await page.evaluate(async () => {
    const { FIRST_LEVEL_P012_LAYOUT: layout, P012_ROUTES: routes } = await import("./Data_FirstLevelP012Layout.mjs");
    const game = window.Tengxian, original = game.Debug.DebugOptions(), runs = [];
    const corridor={x:layout.bounds.minX+7,fromZ:layout.bounds.maxZ-10,toZ:layout.bounds.minZ+10};
    const length = points => points.slice(1).reduce((sum, point, index) => sum
      + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0);
    try {
      game.Debug.SetDebugOption("noCollision", false);
      for (const fastMove of [false, true]) {
        game.Debug.SetDebugOption("fastMove", fastMove);
        game.player.Spawn(corridor.x, corridor.fromZ, 0); game.player.stance = "stand";
        game.player.stamina = 1; game.player.pitch = 0;
        game.Debug.Key("KeyW", true); game.Debug.Key("ShiftLeft", true);
        let tenSeconds = null, frame = 0;
        for (; frame < 5400; frame++) {
          game.StepFrames(1, 1 / 30, false);
          if (frame === 299) tenSeconds = { distanceM: corridor.fromZ - game.player.position.z, position: game.player.position.toArray() };
          if (game.player.position.z <= corridor.toZ) break;
        }
        game.Debug.Key("KeyW", false); game.Debug.Key("ShiftLeft", false);
        runs.push({ fastMove, tenSeconds, crossingSeconds: (frame + 1) / 30,
          reached: game.player.position.z <= corridor.toZ, position: game.player.position.toArray() });
      }
    } finally {
      for (const [id, value] of Object.entries(original)) game.Debug.SetDebugOption(id, value);
    }
    return { bounds: layout.bounds, corridor, corridorLengthM:corridor.fromZ-corridor.toZ, routesM: Object.fromEntries(Object.entries(routes).map(([key, points]) => [key, length(points)])), runs };
  });
  await fs.writeFile(path.join(outputDir, "Data_P012MapScale.json"), JSON.stringify(report, null, 2));
  Check(report.runs.every(run => run.reached && run.tenSeconds && run.crossingSeconds > 10),
    "沿新外框西侧实际走廊测试普通/三倍奔跑，保留真实碰撞与速度", JSON.stringify(report));
}

// Discovery fixture: follow the actual leader and look along his body heading.
// No objective target, route waypoint or interaction-anchor position steers this
// player. This proves the cues are physically usable, not that every human will
// understand them; first-person captures still require visual review.
async function VerifyOpeningDiscovery() {
  const pause = await page.evaluate(() => {
    const game = window.Tengxian;
    game.StepFrames(1200, 1 / 30, false);
    const guide = game.ai.soldiers.find(actor => actor.castId === "luo");
    const before = guide.position.clone();
    game.StepFrames(180, 1 / 30, false);
    // The idle batch did not stop on a capture; discard its stale candidate.
    window.p012PendingTrafficView = null;
    window.p012TrafficCapturedBeats = [];
    game.StepFrames(1);
    return { beat: game.Debug.P012().beat, position: guide.position.toArray(),
      moved: guide.position.distanceTo(before), player: game.player.position.toArray() };
  });
  Check(pause.beat === "B00" && pause.moved < .1, "开局停留观察时罗班长等候，不独自走完路线", JSON.stringify(pause));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012GuideWaitsAtDoor.png") });
  let result;
  for (let chunk = 0; chunk < 45; chunk++) {
    result = await page.evaluate(() => {
      const game = window.Tengxian;
      const bot = window.p012DiscoveryBot ||= { used: [], captured: [], held: false, elapsed: 0 };
      let capture = null, trafficView = null;
      for (let frame = 0; frame < 120; frame++) {
        if (window.p012PendingTrafficView) {
          trafficView = window.p012PendingTrafficView; window.p012PendingTrafficView = null; break;
        }
        const guide = game.ai.soldiers.find(actor => actor.castId === "luo");
        const flow = game.Debug.P012();
        if (bot.used.includes("p012_ammoIssue") || flow.beatIndex >= 2) break;
        const completed = ["p012_weaponCheck", "p012_ammoIssue"].filter(id => game.interact.Point(id)?.count > 0);
        if (completed.length > bot.used.length) { bot.used = completed; game.Debug.Key("KeyF", false); bot.held = false; }
        const waitingAtTable = flow.beatIndex === 1 && guide.scriptMoveSpeedMps === 0;
        const sight = waitingAtTable ? { x: guide.position.x - Math.sin(guide.yaw) * 2.4,
          z: guide.position.z - Math.cos(guide.yaw) * 2.4 } : guide.position;
        game.player.yaw = Math.atan2(-(sight.x - game.player.position.x), -(sight.z - game.player.position.z));
        game.player.pitch = waitingAtTable ? -.15 : 0;
        const query = game.interact.Query(game.player)?.point;
        const usable = waitingAtTable && query && ["p012_weaponCheck", "p012_ammoIssue"].includes(query.id)
          && !bot.used.includes(query.id);
        game.Debug.Key("KeyW", !bot.held && (waitingAtTable
          ? !usable && Math.hypot(sight.x - game.player.position.x, sight.z - game.player.position.z) > 1.1
          : guide.position.distanceTo(game.player.position) > 2.6));
        if (usable && !bot.captured.includes(query.id)) {
          game.Debug.Key("KeyW", false);
          bot.captured.push(query.id);
          game.StepFrames(1);
          capture = { id: query.id, player: game.player.position.toArray(), guide: guide.position.toArray(),
            yaw: game.player.yaw, guideYaw: guide.yaw, label: query.label, at: flow.elapsed };
          break;
        }
        if (usable) { game.Debug.Key("KeyF", true); bot.held = true; }
        game.StepFrames(1, 1 / 30, false); bot.elapsed += 1 / 30;
      }
      game.Debug.Key("KeyW", false);
      if (trafficView) game.StepFrames(1);
      return { used: bot.used, captured: bot.captured, elapsed: bot.elapsed, capture, trafficView,
        flow: game.Debug.P012(), scene: game.Debug.P012Scene(), player: game.player.position.toArray() };
    });
    if (result.capture) {
      await fs.writeFile(path.join(outputDir, `Data_P012Discovery_${result.capture.id}.json`), JSON.stringify(result, null, 2));
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Discovery_${result.capture.id}.png`) });
    }
    if (result.trafficView) {
      await fs.writeFile(path.join(outputDir, `Data_P012Traffic_${result.trafficView.captureId}.json`), JSON.stringify(result.trafficView, null, 2));
      await page.screenshot({ path: path.join(outputDir, `Scene_P012Traffic_${result.trafficView.captureId}.png`) });
    }
    if (result.used.includes("p012_ammoIssue")) break;
  }
  await fs.writeFile(path.join(outputDir, "Data_P012OpeningDiscovery.json"), JSON.stringify(result, null, 2));
  Check(result.used.includes("p012_weaponCheck") && result.used.includes("p012_ammoIssue"),
    "仅跟随罗班长、看向其停步朝向即可实际完成桌边交互（未读取目标坐标）", JSON.stringify(result.used));
  await page.evaluate(() => { window.Tengxian.Debug.Key("KeyF", false); window.Tengxian.Debug.Key("KeyW", false); });
}

// Explicit local guide fixtures: stage/positions are initialized once per case.
// Thereafter the real Runtime, AI and Rapier move the existing leader, and the
// player follows his sampled footsteps with normal input. Not campaign evidence.
async function VerifyHubGuideView() {
  const result=await page.evaluate(async()=>{
    const {Raycaster,Vector3}=await import("three"),game=window.Tengxian;
    const {FirstLevelP012StageZero}=await import("./Script_FirstLevelP012StageZero.mjs");
    const {P012_VILLAGE_LIFE}=await import("./Data_FirstLevelP012VillageLife.mjs");
    let stageZero;const update=FirstLevelP012StageZero.prototype.Update;
    FirstLevelP012StageZero.prototype.Update=function(...args){stageZero=this;return update.apply(this,args);};
    game.StepFrames(1);FirstLevelP012StageZero.prototype.Update=update;
    // Explicit authored parking-state fixture; the movement/swept footprint
    // of the whole route is checked in VillageLifeTest and the actual prelude.
    stageZero.village.mule={...P012_VILLAGE_LIFE.muleRoute.at(-1)};
    stageZero.village.muleIndex=P012_VILLAGE_LIFE.muleRoute.length;stageZero.village.muleYaw=-.9565598624652331;
    const guide=game.ai.soldiers.find(actor=>actor.castId==="luo");
    const at={x:-1.565917751147751,z:1.1024933000095132};
    guide.position.set(at.x,0,at.z);guide.body.Teleport(at.x,0,at.z);guide.goal.copy(guide.position);
    game.player.Spawn(-4.435162958310432,3.1225865355250804,-.9573578971224107);game.player.pitch=0;
    game.StepFrames(1);
    const eye=game.player.EyePosition,target=guide.position.clone().add(new Vector3(0,1.35,0)),direction=target.clone().sub(eye),distance=direction.length();
    const ray=new Raycaster(eye,direction.normalize(),0,distance);
    const Descends=(object,root)=>{for(let node=object;node;node=node.parent)if(node===root)return true;return false;};
    const hits=ray.intersectObjects(game.scene.children,true).filter(hit=>{
      if(hit.object.isSprite||Descends(hit.object,game.viewmodel.root))return false;
      for(let node=hit.object;node;node=node.parent)if(!node.visible)return false;
      return true;
    }).map(hit=>({distance:hit.distance,point:hit.point.toArray(),object:hit.object.name,
      guide:Descends(hit.object,guide.actor.root),ancestors:(()=>{const names=[];for(let node=hit.object;node;node=node.parent)names.push(node.name||node.type);return names;})()}));
    return {player:game.player.position.toArray(),camera:game.camera.position.toArray(),guide:guide.position.toArray(),mule:stageZero.village.Snapshot().mule,hits,
      scope:"explicit recorded B03 placement for visual collision review; no opening-playthrough claim"};
  });
  await fs.writeFile(path.join(outputDir,"Data_P012HubGuideView.json"),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(outputDir,"Scene_P012HubGuideView.png")});
  Check(!result.hits.some(hit=>hit.ancestors.includes("P012VillageLife")),"村口讲解站位与班长之间没有停放的村路物流道具",JSON.stringify(result.hits.slice(0,4)));
}

async function VerifyAircraftModel() {
  await page.waitForFunction(()=>window.Tengxian.scene.getObjectByName("Aircraft_MitsubishiKi30")?.children.length>0,null,{timeout:120000});
  const result=await page.evaluate(async()=>{
    const THREE=await import("three"),g=window.Tengxian;
    const model=g.scene.getObjectByName("Aircraft_MitsubishiKi30").clone(true);
    model.position.set(0,0,0);model.rotation.set(0,0,0);model.visible=true;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    const meshes=[];model.traverse(node=>{if(node.isMesh){const box=new THREE.Box3().setFromObject(node);meshes.push({name:node.name,size:box.getSize(new THREE.Vector3()).toArray(),center:box.getCenter(new THREE.Vector3()).toArray()});}});
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x54616d);scene.add(model);
    scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-5,10,5);scene.add(light);
    const radius=size.x*.65,camera=new THREE.OrthographicCamera(-radius*1.6,radius*1.6,radius,-radius,.1,100);
    camera.position.set(0,20,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
    g.renderer.setRenderTarget(null);g.renderer.render(scene,camera);
    const {AircraftFlight}=await import("./Script_Aircraft.mjs");
    const {AIRCRAFT_ASSETS}=await import("./Data_AircraftAssets.mjs");
    const flight=new AircraftFlight(scene);flight.group.add(model);
    flight.forms=[{spec:AIRCRAFT_ASSETS.find(spec=>spec.id==="MitsubishiKi30"),root:model}];
    flight.SetManualPose("MitsubishiKi30",{x:10,y:120,z:20,dirX:1,dirZ:0,climb:.2,bank:.15});
    model.updateMatrixWorld(true);
    const propeller=new THREE.Box3().setFromObject(model.getObjectByName("Cube_Material_0")).getCenter(new THREE.Vector3());
    const nose=propeller.sub(model.position).normalize();
    const forward=new THREE.Vector3(Math.cos(.2),Math.sin(.2),0);
    return {size:size.toArray(),center:center.toArray(),meshes,declaredWingspan:model.userData.wingspan,
      forwardDot:nose.dot(forward),actualNoseDirection:nose.toArray(),expectedFlightDirection:forward.toArray(),
      scope:"explicit top-down isolated clone of the actual loaded flight model; screen top is -Z, bottom is +Z; no campaign visibility claim"};
  });
  await page.screenshot({path:path.join(outputDir,"Scene_P012AircraftModelTop.png")});
  await fs.writeFile(path.join(outputDir,"Data_P012AircraftModel.json"),JSON.stringify(result,null,2));
  Check(result.size.every(value=>Number.isFinite(value)&&value>0),"实际飞机模型具有有限尺寸",JSON.stringify(result));
  Check(Math.abs(result.size[0]-14.55)<.001&&result.center.every(value=>Math.abs(value)<.001),"Ki-30实际翼展校正为14.55米，缩放后仍以编队根节点为中心");
  Check(result.meshes.find(mesh=>mesh.name==="Cube_Material_0")?.center[2]<-4&&result.forwardDot>.99,
    "真实螺旋桨位于局部-Z机首，带爬升和滚转的飞行姿态仍朝实际航向");
  await page.evaluate(()=>window.Tengxian.StepFrames(1));
}

async function VerifyAirRouteHandoff(choice) {
  Check(["open","ditch"].includes(choice),"空袭局部夹具使用有效路线",choice);
  await page.waitForFunction(()=>window.Tengxian.scene.getObjectByName("Aircraft_MitsubishiKi30")?.children.length>0,null,{timeout:120000});
  const setup=await page.evaluate(async choice=>{
    const game=window.Tengxian;
    const {FirstLevelP012Director}=await import("./Script_FirstLevelP012Flow.mjs");
    const {FirstLevelP012Runtime}=await import("./Script_FirstLevelP012Runtime.mjs");
    const {SETPIECES}=await import("./Script_MissionSetpieces.mjs");
    let flow,runtime,setpiece;
    const updateFlow=FirstLevelP012Director.prototype.Update,updateRuntime=FirstLevelP012Runtime.prototype.Update,updateSetpiece=SETPIECES.CH1_NanLu.Update;
    FirstLevelP012Director.prototype.Update=function(...args){flow=this;return updateFlow.apply(this,args);};
    FirstLevelP012Runtime.prototype.Update=function(...args){runtime=this;return updateRuntime.apply(this,args);};
    SETPIECES.CH1_NanLu.Update=function(s,...args){setpiece=s;return updateSetpiece.call(this,s,...args);};
    game.StepFrames(1);
    FirstLevelP012Director.prototype.Update=updateFlow;FirstLevelP012Runtime.prototype.Update=updateRuntime;SETPIECES.CH1_NanLu.Update=updateSetpiece;
    // Explicit local fixture initialization. Once started, only player input is
    // driven: production actors, collision, signals and aircraft keep updating.
    const activity=flow.config.activities,at=activity.airObservationPosition,column=setpiece.mem.column;
    setpiece.mem.prepWounded.Reset();column.Reset();
    column.waypoints=[{x:110,z:53},{x:112.8,z:54},{x:114,z:57},{x:110,z:68},{x:107,z:80}];
    column.Start();column.scriptPaused=true;
    const guide=runtime.host.GuideActor();runtime.host.ReleaseDefense(guide);runtime.host.ReleaseGuide(guide);
    guide.position.set(at.x,0,at.z);guide.body.Teleport(at.x,0,at.z);guide.goal.copy(guide.position);
    game.player.Spawn(at.x+2,at.z,0);
    flow.Restore({...flow.Snapshot(),beat:16,unlockedWaves:[0,1,2,3,4,5,6],spawnedTotal:25,routeIndex:0,
      facts:["regroup","roadWounded"],signals:["P012AirObserveOpen"]});
    flow.Emit("P012AirObserveOpen");
    window.p012AirFixture={choice,flow,runtime,setpiece,column,trace:[],frames:0,initialHead:column.HeadPosition()};
    return {choice,player:game.player.position.toArray(),head:column.HeadPosition(),members:column.Count,
      originalCivilianId:column.Civilians.at(-1)?.handle.id,
      scope:"explicit B16 setup; new local column placement, no sequential campaign or first-play claim"};
  },choice);
  let result;
  for(let chunk=0;chunk<60;chunk++){
    result=await page.evaluate(()=>{
      const game=window.Tengxian,f=window.p012AirFixture;
      for(let frame=0;frame<90;frame++){
        const state=f.flow.State(),air=game.Debug.Strafe.State().run,objective=state.objective;
        const choosing=!state.airRouteChoice;
        const target=choosing&&game.story.Signalled("P012AircraftRailFire")
          ? f.flow.config.activities.airRouteChoices[f.choice][0] : objective.target;
        const dx=target?target.x-game.player.position.x:0,dz=target?target.z-game.player.position.z:0,distance=Math.hypot(dx,dz);
        let walk=!!target&&distance>.7;
        game.player.yaw=Math.atan2(-dx,-dz);game.player.pitch=0;
        // Deliberately miss the first aircraft glance: there must be no hidden
        // look flag after the public goal already asks the player to choose.
        if(choosing&&!game.story.Signalled("P012AircraftRailFire")){walk=false;game.player.yaw=0;}
        if(air?.presetId==="crowdTurn"&&air.phase==="approach"){
          const eye=game.player.EyePosition,plane=air.aircraft;
          game.player.yaw=Math.atan2(-(plane.x-eye.x),-(plane.z-eye.z));
          game.player.pitch=Math.atan2(plane.y-eye.y,Math.hypot(plane.x-eye.x,plane.z-eye.z));walk=false;
        }
        game.Debug.Key("KeyW",walk);game.StepFrames(1,1/30,false);f.frames++;
        if(f.frames%15===0)f.trace.push({at:f.frames/30,beat:f.flow.State().beat,choice:f.flow.airRouteChoice,
          player:game.player.position.toArray(),head:f.column.HeadPosition(),paused:f.column.scriptPaused,
          air:air?{preset:air.presetId,phase:air.phase}:null,facts:[...f.flow.facts]});
        if(air?.presetId==="crowdTurn"&&air.phase==="approach"&&f.lastAirPhoto!==Math.floor(air.t)){
          f.lastAirPhoto=Math.floor(air.t);f.pendingAirPhoto=f.lastAirPhoto;break;
        }
        if(game.story.Signalled("P012AirObstacleCreated"))break;
      }
      game.Debug.Key("KeyW",false);game.StepFrames(1);
      return {beat:f.flow.State().beat,choice:f.flow.airRouteChoice,obstacle:game.story.Signalled("P012AirObstacleCreated"),
        frames:f.frames,trace:f.trace,views:window.p012AirViews,scene:game.Debug.P012Scene(),members:f.column.Count,props:game.Debug.SetpieceProps(),photo:f.pendingAirPhoto??null};
    });
    if(result.photo!==null){
      await page.screenshot({path:path.join(outputDir,`Scene_P012AirTurn_${choice}_${result.photo}.png`)});
      await page.evaluate(()=>{window.p012AirFixture.pendingAirPhoto=null;});
    }
    if(result.obstacle)break;
  }
  result.airTurnEvidence=AirTurnEvidence(result.views);
  await fs.writeFile(path.join(outputDir,`Data_P012AirRoute_${choice}.json`),JSON.stringify({setup,result},null,2));
  await page.screenshot({path:path.join(outputDir,`Scene_P012AirRoute_${choice}.png`)});
  Check(result.choice===choice&&result.beat==="B17"&&result.obstacle,"实际选路后才在道路触发转向扫射与阻碍",JSON.stringify({beat:result.beat,choice:result.choice,elapsed:result.frames/30}));
  Check(!result.trace.some(entry=>entry.beat==="B16"&&entry.air?.preset==="crowdTurn"),"第二轮攻击不越过真实选路与道路到达");
  Check(!result.trace.some(entry=>entry.facts.includes("airObserved")),"错过首轮航迹不伪造已观察事实");
  Check(setup.members===10&&result.members===10,"局部初始十人队列在空袭交接中不重复生成");
  Check(result.views.filter(view=>!view.crowdFire).every(view=>view.cartObstacle?.open
    && !view.cartObstacle.visible && !view.cartObstacle.colliding),"扫射前道路没有翻车外观或碰撞，担架员无需翻越未来障碍");
  Check(result.airTurnEvidence.longestVisibleS>=4,"转向开火前真实自由视角连续可见至少四秒",JSON.stringify(result.airTurnEvidence));
  Check(result.airTurnEvidence.jointViews>0,"转向时真实同屏可辨认飞机、担架员和平民");
  if(process.argv.includes("--air-rescue")||process.argv.includes("--air-carry")||process.argv.includes("--air-dive")){
    let rescue;
    for(let chunk=0;chunk<80;chunk++){
      rescue=await page.evaluate(({carryReview,dropReview})=>{
      const game=window.Tengxian,f=window.p012AirFixture;
      f.rescueTrace||=[];f.rescueFrames||=0;let held=false,capture=null;
      for(let frame=0;frame<90;frame++,f.rescueFrames++){
        const state=f.flow.State();if(state.beatIndex>=(carryReview?19:18))break;
        let objective=state.objective;
        if(state.beatIndex===17&&!state.facts.includes("airObstacleResolved")&&!game.carry.Active){
          const casualty=f.setpiece.mem.p012AirCivilian;
          objective={target:casualty?.position,interactionId:casualty?"p012_airRescue":null};
        }
        const point=objective.interactionId&&game.interact.Point(objective.interactionId);
        const target=objective.target,dx=target?target.x-game.player.position.x:0,dz=target?target.z-game.player.position.z:0,distance=Math.hypot(dx,dz);
        game.player.yaw=Math.atan2(-dx,-dz);game.player.pitch=0;
        const query=game.interact.Query(game.player)?.point,usable=!!point&&query?.id===point.id;
        game.Debug.Key("KeyW",!!target&&!usable&&distance>.5);game.Debug.Key("KeyF",usable);held=usable;
        game.StepFrames(1,1/30,false);
        const civilian=game.Debug.P012Scene().airCivilian;
        if(f.rescueFrames%15===0)f.rescueTrace.push({at:f.rescueFrames/30,beat:f.flow.State().beat,position:game.player.position.toArray(),
          target,interaction:point?.id,query:query?.id,carry:game.carry.KindId,carriedS:game.carry.View()?.carriedS,
          civilian,litters:game.Debug.P012Scene().litters,carryHands:game.Debug.P012CarryView(),facts:[...f.flow.facts]});
        if(civilian?.carried&&game.carry.View()?.carriedS>2&&!f.civilianCarryCaptured){
          f.civilianCarryCaptured=true;capture="CarriedCivilian";break;
        }
        if(dropReview&&civilian?.carried&&game.carry.View()?.carriedS>3&&!f.civilianDropped){
          f.civilianDropped=true;game.Debug.Key("KeyF",false);game.StepFrames(1);
          game.Debug.Key("KeyF",true);game.StepFrames(1);game.Debug.Key("KeyF",false);
        }
      }
      game.Debug.Key("KeyW",false);game.Debug.Key("KeyF",false);game.StepFrames(1);
      return {frames:f.rescueFrames,trace:f.rescueTrace,held,flow:f.flow.State(),scene:game.Debug.P012Scene(),carry:game.carry.KindId,capture,
        pickups:game.interact.Point("p012_airRescue")?.count,dropped:!!f.civilianDropped};
      },{carryReview:process.argv.includes("--air-carry")||process.argv.includes("--air-dive"),dropReview:process.argv.includes("--air-drop")});
      if(rescue.capture){
        await page.evaluate(()=>{
          const g=window.Tengxian,at=g.player.position,camera=g.camera.clone();
          camera.position.set(at.x+3,at.y+2.6,at.z+4);camera.lookAt(at.x,at.y+1,at.z);camera.updateMatrixWorld(true);
          window.p012CarryViewmodelVisible=g.viewmodel.root.visible;g.viewmodel.root.visible=false;
          g.renderer.setRenderTarget(null);g.renderer.render(g.scene,camera);
        });
        await page.screenshot({path:path.join(outputDir,"Scene_P012CarriedCivilianExternalView.png")});
        await page.evaluate(()=>{const g=window.Tengxian;g.viewmodel.root.visible=window.p012CarryViewmodelVisible;g.StepFrames(1);});
      }
      if(rescue.flow.beatIndex>=(process.argv.includes("--air-carry")||process.argv.includes("--air-dive")?19:18))break;
    }
    await fs.writeFile(path.join(outputDir,"Data_P012AirRescue.json"),JSON.stringify(rescue,null,2));
    await page.screenshot({path:path.join(outputDir,"Scene_P012AirRescue.png")});
    Check(rescue.flow.beatIndex>=18&&rescue.flow.facts.includes("airRescued"),
      "实际按键背起百姓、绕入沟岸、放到硬掩体后并回接担架",JSON.stringify({beat:rescue.flow.beat,seconds:rescue.frames/30,travel:rescue.flow.airRescueTravelM}));
    const carriedCivilian=rescue.trace.filter(sample=>sample.civilian?.carried),patient=rescue.scene.airCivilian;
    Check(carriedCivilian.length>3&&patient?.id===setup.originalCivilianId&&patient?.delivered&&patient.alive&&carriedCivilian.every(sample=>sample.civilian.id===patient.id
      &&Math.hypot(sample.civilian.position.x-sample.position[0],sample.civilian.position.z-sample.position[2])<.5),
      "实际受伤、连续随身搬运和安置始终是同一个活着的百姓角色",JSON.stringify(patient));
    if(process.argv.includes("--air-drop"))Check(rescue.dropped&&rescue.pickups>=2,"中途真实按F放下后可在实际落点再次背起同一人");
    await page.evaluate(()=>{
      const g=window.Tengxian,at=g.Debug.P012Scene().airCivilian.position,camera=g.camera.clone();
      camera.position.set(at.x+2,at.y+2,at.z+3);camera.lookAt(at.x,at.y+.3,at.z);camera.updateMatrixWorld(true);
      window.p012CarryViewmodelVisible=g.viewmodel.root.visible;g.viewmodel.root.visible=false;
      g.renderer.setRenderTarget(null);g.renderer.render(g.scene,camera);
    });
    await page.screenshot({path:path.join(outputDir,"Scene_P012DeliveredCivilianExternalView.png")});
    await page.evaluate(()=>{const g=window.Tengxian;g.viewmodel.root.visible=window.p012CarryViewmodelVisible;g.StepFrames(1);});
    if(process.argv.includes("--air-carry")||process.argv.includes("--air-dive"))Check(rescue.flow.beat==="B19"&&rescue.carry==="stretcher",
      "仍抬着同一担架到达沟边后才迎来俯冲",JSON.stringify({beat:rescue.flow.beat,distance:rescue.scene.carryDistance,seconds:rescue.trace.at(-1)?.carriedS}));
    if(process.argv.includes("--air-carry")||process.argv.includes("--air-dive")){
      const before=await page.evaluate(()=>({yaw:window.Tengxian.player.yaw,pitch:window.Tengxian.player.pitch}));
      const hands=[];
      for(const [name,turn,pitch] of [["LookDown",0,-1.15],["LookLeft",.8,-.85],["LookBack",Math.PI,0]]){
        const sample=await page.evaluate(({turn,pitch})=>{
          const g=window.Tengxian,view=g.Debug.P012CarryView();
          g.player.yaw=view.bodyYaw+turn;g.player.pitch=pitch;g.StepFrames(1);
          return {hands:g.Debug.P012CarryView(),gunVisible:g.viewmodel.root.visible,bodyVisible:g.viewmodel.body?.root.visible,
            carry:g.carry.KindId,litterId:g.Debug.P012Scene().litters.find(litter=>litter.originalCarried)?.id};
        },{turn,pitch});
        hands.push({name,...sample});
        await page.screenshot({path:path.join(outputDir,`Scene_P012CarryHands${name}.png`)});
      }
      await page.evaluate(before=>{const g=window.Tengxian;g.player.yaw=before.yaw;g.player.pitch=before.pitch;g.StepFrames(1);},before);
      await fs.writeFile(path.join(outputDir,"Data_P012CarryHands.json"),JSON.stringify({views:hands,travel:rescue.trace.filter(sample=>sample.carry==="stretcher")},null,2));
      Check(hands.every(sample=>sample.hands?.visible&&sample.bodyVisible&&!sample.gunVisible
        &&sample.hands.litterId===sample.litterId&&["r","l"].every(side=>sample.hands.reachable[side]
          &&sample.hands.gripError[side]<=.006&&sample.hands.handTranslation[side]<=.006)),
        "真实双手握住原担架；低头和回看均保持世界握点，身体可见且枪收起",JSON.stringify(hands));
    }
    if(process.argv.includes("--air-dive")){
      const dive=await page.evaluate(()=>{
        const game=window.Tengxian,f=window.p012AirFixture,trace=[];
        const original=game.Debug.P012Scene().litters.find(litter=>litter.originalCarried)?.id;
        let carriedS=0;
        for(let frame=0;frame<600;frame++){
          const view=game.carry.View(),air=game.Debug.Strafe.State().run,open=air?.presetId==="divePress"&&air.player?.open;
          carriedS=Math.max(carriedS,view?.carriedS||0);
          const slot=f.flow.config.anchors.strafeSlots[0],target={x:slot.x,z:slot.z+(open?0:1.8)};
          const dx=target.x-game.player.position.x,dz=target.z-game.player.position.z;
          game.player.yaw=Math.atan2(-dx,-dz);game.player.pitch=0;
          if(open&&game.player.stance!=="prone")game.Debug.Key("KeyZ");
          game.Debug.Key("KeyW",Math.hypot(dx,dz)>.2);
          game.StepFrames(1,1/30,false);
          if(frame%3===0)trace.push({at:f.flow.elapsed,carry:view?.kindId,carriedS:view?.carriedS,open,stance:game.player.stance,position:game.player.position.toArray(),run:air?.presetId,phase:air?.phase,carryHands:game.Debug.P012CarryView()});
          if(f.flow.State().beatIndex>=20)break;
        }
        game.Debug.Key("KeyW",false);game.StepFrames(1);
        return {original,carriedS,trace,flow:f.flow.State(),scene:game.Debug.P012Scene(),carry:game.carry.KindId};
      });
      await fs.writeFile(path.join(outputDir,"Data_P012AirDive.json"),JSON.stringify(dive,null,2));
      await page.screenshot({path:path.join(outputDir,"Scene_P012AirDive.png")});
      Check(dive.flow.beat==="B20"&&dive.scene.litterOverturned&&dive.carry===null
        &&dive.scene.litters.find(litter=>litter.originalCarried)?.id===dive.original,
        "真实危险窗按键扑沟，原担架松手侧翻，进入沟内交火",JSON.stringify({beat:dive.flow.beat,original:dive.original,carriedS:dive.carriedS}));
      Check(dive.carriedS>=20&&dive.carriedS<=30,"正常搬运到俯冲之间实际握住担架20至30秒",String(dive.carriedS));
      Check(dive.trace.some(sample=>sample.carryHands?.releasing)
        &&dive.trace.some(sample=>sample.carryHands&&!sample.carryHands.visible),
        "实际强制松手后双臂撤回并隐藏，侧翻后不继续抓住空中握点");
    }
  }
}

async function VerifyMachineGunCrew() {
  const setup=await page.evaluate(async()=>{
    const g=window.Tengxian,{FirstLevelP012Director,P012_WAVES}=await import("./Script_FirstLevelP012Flow.mjs");
    const {FirstLevelP012Runtime}=await import("./Script_FirstLevelP012Runtime.mjs");
    const update=FirstLevelP012Director.prototype.Update,runtimeUpdate=FirstLevelP012Runtime.prototype.Update;
    let flow,runtime;
    FirstLevelP012Director.prototype.Update=function(...args){flow=this;return update.apply(this,args);};
    FirstLevelP012Runtime.prototype.Update=function(...args){runtime=this;return runtimeUpdate.apply(this,args);};
    g.StepFrames(1);FirstLevelP012Director.prototype.Update=update;FirstLevelP012Runtime.prototype.Update=runtimeUpdate;
    // Explicit local B08 setup isolates the two authored MG actors. Their spawn,
    // route consumption, AI state, damage and collision remain production code.
    flow.beat=8;flow.guideStarted=true;flow.unlockedWaves=P012_WAVES.map((_,index)=>index);
    runtime.Update=function(dt){this.time+=dt;};
    flow.SpawnWave(P012_WAVES[2],2);
    const at=flow.config.anchors.gunports[2];g.player.Spawn(at.x,at.z,0);g.Debug.Key("KeyZ");
    window.p012MgCrewFixture={flow,runtime,actors:runtime.near.slice(),trace:[],frames:0};
    return {scope:"explicit local B08 crew movement and separation fixture, not campaign or shooting performance",terminals:flow.config.enemyLanes.machineGun.terminalGoals};
  });
  let result;
  for(let chunk=0;chunk<12;chunk++){
    result=await page.evaluate(()=>{
      const g=window.Tengxian,f=window.p012MgCrewFixture;
      for(let frame=0;frame<150;frame++){
        g.StepFrames(1,1/30,false);f.frames++;
        if(f.frames%30===0)f.trace.push({at:f.frames/30,actors:f.actors.map(actor=>({id:actor.id,weapon:actor.weaponId,alive:actor.alive,
          position:actor.position.toArray(),holdZone:actor.holdZone,state:actor.state,radius:actor.body.radius}))});
      }
      g.StepFrames(1);
      return {actors:f.trace.at(-1).actors,trace:f.trace,health:g.player.health,
        routes:f.flow.enemyRoutes.map(route=>({index:route.index,points:route.points}))};
    });
  }
  await fs.writeFile(path.join(outputDir,"Data_P012MachineGunCrew.json"),JSON.stringify({...setup,...result},null,2));
  await page.evaluate(()=>{
    const g=window.Tengxian,camera=g.camera.clone();camera.position.set(23,2.5,-172);camera.lookAt(23,.9,-180);camera.updateMatrixWorld(true);
    window.p012MgViewmodelVisible=g.viewmodel.root.visible;g.viewmodel.root.visible=false;g.renderer.setRenderTarget(null);g.renderer.render(g.scene,camera);
  });
  await page.screenshot({path:path.join(outputDir,"Scene_P012MachineGunCrewExternalView.png")});
  await page.evaluate(()=>{const g=window.Tengxian;g.viewmodel.root.visible=window.p012MgViewmodelVisible;g.StepFrames(1);});
  const [gunner,assistant]=result.actors,distance=Math.hypot(gunner.position[0]-assistant.position[0],gunner.position[2]-assistant.position[2]);
  Check(result.actors.length===2&&gunner.weapon==="Type11"&&assistant.weapon==="Type38"&&result.actors.every(actor=>actor.alive),"真实机枪主副手保持原人数与枪械");
  Check(distance>=1.2&&result.actors.every((actor,index)=>Math.hypot(actor.position[0]-setup.terminals[index].x,actor.position[2]-setup.terminals[index].z)<=2.1),
    "实际AI沿原路分别进入掩体后两槽，身体不重叠",JSON.stringify({distance,actors:result.actors}));
}

async function VerifyFrontlineRejoin() {
  const result=await page.evaluate(async()=>{
    const g=window.Tengxian;
    const {FirstLevelP012Director}=await import("./Script_FirstLevelP012Flow.mjs");
    FirstLevelP012Director.prototype.Update=function(dt,sample){this.elapsed+=dt;this.lastSample=sample;};
    const impact=g.player.position.clone().set(3.5283382354584543,0,-104.75711415617816);
    g.battlefield.deformation?.ApplyBlast(impact,"launcher");
    g.StepFrames(2);
    g.player.Spawn(5,-94,0);
    g.Debug.Key("KeyZ");
    const body=g.player.body,move=body.Move;
    let lastMove=null;
    body.Move=function(...args){
      const moved=move.apply(this,args),cc=this.pw.controller,hits=[];
      for(let i=0;i<cc.numComputedCollisions();i++){
        const hit=cc.computedCollision(i),collider=hit?.collider;
        hits.push({handle:collider?.handle,record:this.pw.recordByHandle.get(collider?.handle),
          normal:hit?.normal1,point:hit?.witness1,position:collider?.translation?.()});
      }
      lastMove={requested:args,moved,hits};return moved;
    };
    const trace=[];
    g.Debug.Key("KeyW",true);
    for(let frame=0;frame<600;frame++){
      g.StepFrames(1,1/30,false);
      if(frame%15===0)trace.push({at:frame/30,position:g.player.position.toArray(),
        velocity:g.player.velocity.toArray(),stance:g.player.stance,grounded:g.player.grounded,
        radius:body.radius,height:body.height,lastMove});
      if(g.player.position.z<-100)break;
    }
    g.Debug.Key("KeyW",false);g.StepFrames(1);body.Move=move;
    return {scope:"local prone traversal across the recorded B07 launcher crater tile; explicit blast setup, production collision and ordinary W/Z input, no campaign or combat claim",trace,
      arrived:g.player.position.z<-100,position:g.player.position.toArray()};
  });
  await fs.writeFile(path.join(outputDir,"Data_P012FrontlineRejoin.json"),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(outputDir,"Scene_P012FrontlineRejoin.png")});
  Check(result.arrived,"局部复现：卧姿实际穿过反斜面交通壕",JSON.stringify(result.position));
}

async function VerifyWoundedGuide() {
  const setup=await page.evaluate(async()=>{
    const game=window.Tengxian;
    const {FirstLevelP012Director}=await import("./Script_FirstLevelP012Flow.mjs");
    const {FirstLevelP012Runtime}=await import("./Script_FirstLevelP012Runtime.mjs");
    let runtime,flow;
    const update=FirstLevelP012Runtime.prototype.Update;
    FirstLevelP012Runtime.prototype.Update=function(...args){runtime=this;return update.apply(this,args);};
    FirstLevelP012Director.prototype.Update=function(dt,sample){flow=this;this.elapsed+=dt;this.lastSample={...sample,woundedDragDelivered:true};};
    game.StepFrames(1);FirstLevelP012Runtime.prototype.Update=update;
    const guide=runtime.host.GuideActor(),x=-16.645382287623885,z=-100.03317381459081;
    const y=game.battlefield.GroundHeight(x,z);
    guide.position.set(x,y,z);guide.body.Teleport(x,y,z);guide.goal.copy(guide.position);
    runtime.host.ReleaseGuide(guide);runtime.host.Defend(guide,{x,z},runtime.config.activities.frontlineDoctrine);
    game.player.Spawn(-6.3258401273,-91.889215854,0);
    flow.lastSample={position:game.player.position,guidePosition:guide.position,woundedDragDelivered:true};
    flow.beat=11;flow.StartGuide();flow.beat=12;flow.StartGuide();
    runtime.Update=function(dt){this.time+=dt;this.StepSafeGuide(this.guide,guide,dt);};
    window.p012WoundedGuideFixture={flow,runtime,guide,frames:0,trace:[]};
    return {start:guide.position.toArray(),radius:guide.body.radius,
      scope:"local B11 to B12 handoff with recorded initial guide/player positions and a delivered casualty; real AI, collision and volunteer interaction"};
  });
  let result;
  for(let chunk=0;chunk<10;chunk++){
    result=await page.evaluate(()=>{
      const g=window.Tengxian,f=window.p012WoundedGuideFixture;
      for(let frame=0;frame<120;frame++){
        g.StepFrames(1,1/30,false);f.frames++;
        if(f.frames%15===0)f.trace.push({at:f.frames/30,position:f.guide.position.toArray(),
          goal:f.guide.goal.toArray(),approachIndex:f.runtime.guide.approachIndex,index:f.runtime.guide.index});
        const end=f.runtime.guide.route.at(-1);
        if(f.runtime.guide.index===f.runtime.guide.route.length-1&&Math.hypot(f.guide.position.x-end.x,f.guide.position.z-end.z)<.6)break;
      }
      g.StepFrames(1);
      const end=f.runtime.guide.route.at(-1);
      return {arrived:f.runtime.guide.index===f.runtime.guide.route.length-1&&Math.hypot(f.guide.position.x-end.x,f.guide.position.z-end.z)<.6,
        elapsed:f.frames/30,gap:f.guide.position.distanceTo(g.player.position),alive:f.guide.alive,
        guide:f.guide.position.toArray(),trace:f.trace};
    });
    if(result.arrived)break;
  }
  const interaction=await page.evaluate(()=>{
    const g=window.Tengxian,f=window.p012WoundedGuideFixture;
    const target=f.guide.position;
    g.player.yaw=Math.atan2(-(target.x-g.player.position.x),-(target.z-g.player.position.z));g.player.pitch=-.2;
    g.StepFrames(1);const query=g.interact.Query(g.player)?.point?.id;
    g.Debug.Key("KeyF",true);g.StepFrames(60,1/30,false);g.Debug.Key("KeyF",false);g.StepFrames(1);
    return {volunteer:f.flow.facts.has("volunteer"),requested:g.story.Signalled("P012EscortRequested"),query,
      guideAlive:f.flow.lastSample.guideAlive};
  });
  await fs.writeFile(path.join(outputDir,"Data_P012WoundedGuideFixture.json"),JSON.stringify({setup,result,interaction},null,2));
  await page.screenshot({path:path.join(outputDir,"Scene_P012WoundedGuideFixture.png")});
  Check(result.alive&&result.gap<2&&interaction.volunteer&&interaction.requested,
    "班长从西侧实走绕墙赶上已送抵的伤员，原地按F可主动申请护送",JSON.stringify({elapsed:result.elapsed,gap:result.gap,interaction}));
}

async function VerifyRoadCover() {
  const setup=await page.evaluate(async()=>{
    const game=window.Tengxian;
    const {FirstLevelP012Director}=await import("./Script_FirstLevelP012Flow.mjs");
    const {FirstLevelP012Runtime}=await import("./Script_FirstLevelP012Runtime.mjs");
    let runtime;
    const update=FirstLevelP012Runtime.prototype.Update;
    FirstLevelP012Runtime.prototype.Update=function(...args){runtime=this;return update.apply(this,args);};
    FirstLevelP012Director.prototype.Update=function(dt,sample){this.elapsed+=dt;this.lastSample=sample;};
    game.StepFrames(1);FirstLevelP012Runtime.prototype.Update=update;
    // Local movement fixture only: keep the real actors, AI and all colliders.
    // Isolate cover deployment from opening/march/wave creation and use the
    // recorded failure positions once; never place them again during motion.
    const actors=["yaowa","zhaodegui"].map(id=>game.ai.soldiers.find(actor=>actor.castId===id));
    const starts=[[88.85585591793972,16.492127169043215],[85.90991836618427,10.001580207664762]];
    actors.forEach((actor,index)=>{
      const [x,z]=starts[index],y=game.battlefield.GroundHeight(x,z);
      actor.position.set(x,y,z);actor.body.Teleport(x,y,z);actor.goal.copy(actor.position);
      runtime.host.ReleaseGuide(actor);runtime.host.ReleaseDefense(actor);
    });
    const guide=runtime.host.GuideActor(),gx=91.59581127273565,gz=11.626881436346338;
    guide.position.set(gx,game.battlefield.GroundHeight(gx,gz),gz);guide.body.Teleport(...guide.position.toArray());
    runtime.host.ReleaseGuide(guide);runtime.host.Defend(guide,{x:gx,z:gz},runtime.config.activities.frontlineDoctrine);
    game.player.Spawn(89.20589224727036,10.527175455117147,Math.PI);
    game.story.Signal("P012RoadContactHold");runtime.beat=13;runtime.defenders=actors;
    runtime.Update=function(dt){this.time+=dt;this.StepRoadCover();};
    window.p012RoadCoverFixture={runtime,actors,frames:0,trace:[]};
    return {scope:"explicit local B13 cover fixture using recorded initial actor/player positions; no campaign or combat claim",
      starts,actors:actors.map(actor=>({id:actor.id,radius:actor.body.radius}))};
  });
  let result;
  for(let chunk=0;chunk<6;chunk++){
    result=await page.evaluate(()=>{
      const g=window.Tengxian,f=window.p012RoadCoverFixture;
      for(let frame=0;frame<200;frame++){
        g.StepFrames(1,1/30,false);f.frames++;
        if(f.frames%10===0)f.trace.push({at:f.frames/30,actors:f.actors.map(actor=>({id:actor.id,
          position:actor.position.toArray(),goal:actor.goal.toArray(),guided:actor.p012Guided,
          defensive:actor.scriptDefensive,state:actor.state}))});
        if(f.runtime.roadCoverMoves?.every(entry=>entry.arrived))break;
      }
      g.StepFrames(1);
      return {arrived:f.runtime.roadCoverMoves?.every(entry=>entry.arrived),elapsed:f.frames/30,trace:f.trace,
        actors:f.actors.map((actor,index)=>({id:actor.id,alive:actor.alive,position:actor.position.toArray(),
          gap:Math.hypot(actor.position.x-f.runtime.config.activities.roadContactFriendlyCovers[index].x,
            actor.position.z-f.runtime.config.activities.roadContactFriendlyCovers[index].z)}))};
    });
    if(result.arrived)break;
  }
  await fs.writeFile(path.join(outputDir,"Data_P012RoadCoverFixture.json"),JSON.stringify({setup,result},null,2));
  await page.screenshot({path:path.join(outputDir,"Scene_P012RoadCoverFixture.png")});
  Check(result.arrived&&result.actors.every(actor=>actor.alive&&actor.gap<.6),
    "原两名队友以真实AI和碰撞绕过院墙并实际占住两处掩体",JSON.stringify({elapsed:result.elapsed,actors:result.actors}));
}

async function VerifyGuideHandoffs() {
  for (const beat of [14, 15, 22, 23]) {
    const setup=await page.evaluate(async beat=>{
      const game=window.Tengxian;
      const {FirstLevelP012Director}=await import("./Script_FirstLevelP012Flow.mjs");
      const {FirstLevelP012Runtime}=await import("./Script_FirstLevelP012Runtime.mjs");
      const {P012NextVisiblePoint}=await import("./Script_FirstLevelP012March.mjs");
      let flow,runtime;
      const original=FirstLevelP012Runtime.prototype.Update;
      FirstLevelP012Runtime.prototype.Update=function(...args){runtime=this;return original.apply(this,args);};
      // Freeze only automatic stage/wave progression in this isolated fixture.
      // Actual interaction callbacks and actor update/physics remain production.
      FirstLevelP012Director.prototype.Update=function(dt,sample){flow=this;this.elapsed+=dt;this.lastSample=sample;};
      game.StepFrames(1);
      FirstLevelP012Runtime.prototype.Update=original;
      const guide=runtime.host.GuideActor();
      const start=beat===14?{x:79.42825739632826,z:4.633856495656801}:beat===15?{x:95.78584399952966,z:15.377326136763912}:beat===22?{x:105.575,z:68.092}:{x:94,z:105};
      const playerStart=beat===14?{x:76.3,z:2.1}:beat===15?{x:94,z:16}:beat===22?{x:104,z:66}:{x:91,z:105};
      const y=game.battlefield.GroundHeight(start.x,start.z);
      guide.position.set(start.x,y,start.z);guide.body.Teleport(start.x,y,start.z);guide.goal.copy(guide.position);
      game.player.Spawn(playerStart.x,playerStart.z,0);
      runtime.host.ReleaseGuide(guide);
      runtime.host.Defend(guide,start,flow.config.activities.frontlineDoctrine);
      const hadDefense=guide.scriptDefensive;
      let b20=null;
      if(beat===22){
        runtime.Guide({beat:20,route:[]});game.StepFrames(360,1/30,false);
        const target=flow.config.activities.closeFightRoute[1],player=game.player.position;
        b20=runtime.host.FriendlyActors().filter(actor=>!runtime.host.IsStretcherBearer?.(actor)).map(actor=>{
          const dx=actor.position.x-player.x,dz=actor.position.z-player.z,tx=target.x-player.x,tz=target.z-player.z;
          return {position:actor.position.toArray(),groundError:Math.abs(actor.position.y-game.battlefield.GroundHeight(actor.position.x,actor.position.z)),
            crosshairAngle:Math.acos(Math.max(-1,Math.min(1,(dx*tx+dz*tz)/(Math.hypot(dx,dz)*Math.hypot(tx,tz)||1))))};
        });
      }
      flow.beat=beat;if(beat===15)flow.facts.add("roadWounded");
      flow.lastSample={position:game.player.position,guidePosition:guide.position};flow.StartGuide();
      window.p012GuideFixture={flow,runtime,guide,trail:[{...start}],P012NextVisiblePoint,trace:[],frames:0,
        event:beat===14?"P012GuideAtFlankEntry":beat===15?"P012GuideAtAirObservation":beat===22?"P012GuideAtBlockade":"P012GuideAtSmoke",start:{...start}};
      return {beat,start,playerStart,hadDefense,b20,scope:"explicit local stage fixture; only initial placement, no campaign or balance claim"};
    },beat);
    let result;
    for(let chunk=0;chunk<60;chunk++){
      result=await page.evaluate(()=>{
        const g=window.Tengxian,f=window.p012GuideFixture;
        for(let i=0;i<120;i++){
          const at=f.guide.position,last=f.trail.at(-1);
          if(Math.hypot(at.x-last.x,at.z-last.z)>.4)f.trail.push({x:at.x,z:at.z});
          while(f.trail.length>1&&Math.hypot(g.player.position.x-f.trail[0].x,g.player.position.z-f.trail[0].z)<1)f.trail.shift();
          const next=f.P012NextVisiblePoint(f.flow.config.layout.blocks,g.player.position,[...f.trail,{x:at.x,z:at.z}],0,.42);
          const gap=Math.hypot(at.x-g.player.position.x,at.z-g.player.position.z);
          const look=next.blocked?at:next.point;
          g.player.yaw=Math.atan2(-(look.x-g.player.position.x),-(look.z-g.player.position.z));g.player.pitch=0;
          g.Debug.Key("KeyW",gap>2.4&&!next.blocked);
          g.StepFrames(1,1/30,false);f.frames++;
          if(f.frames%15===0)f.trace.push({at:f.frames/30,player:g.player.position.toArray(),guide:at.toArray(),
            defensive:!!f.guide.scriptDefensive,gap});
          if(g.story.Signalled(f.event)&&gap<3)break;
        }
        g.Debug.Key("KeyW",false);g.StepFrames(1);
        const decision=f.flow.config.activities.blockadeDecisionPosition,blockade=f.flow.config.anchors.blockadePositions?.[1];
        let view=null;
        if(f.flow.beat===22&&decision&&blockade){
          g.camera.fov=55;g.camera.updateProjectionMatrix();
          const eye=g.player.EyePosition,look=f.guide.position.clone().add({x:0,y:1.25,z:0});
          g.player.yaw=Math.atan2(-(blockade.x-g.player.position.x),-(blockade.z-g.player.position.z));g.player.pitch=0;g.StepFrames(2);
          const guideScreen=look.project(g.camera).toArray(),blockadePoint=f.guide.position.clone().set(blockade.x,g.battlefield.GroundHeight(blockade.x,blockade.z)+1,blockade.z);
          const blockadeScreen=blockadePoint.project(g.camera).toArray(),direction=g.camera.getWorldDirection(f.guide.position.clone()),hit=g.battlefield.Raycast(eye,direction,3);
          view={fov:g.camera.fov,guideScreen,blockadeScreen,nearCenterWall:!!hit};
        }
        return {arrived:g.story.Signalled(f.event),gap:f.guide.position.distanceTo(g.player.position),
          guide:f.guide.position.toArray(),player:g.player.position.toArray(),stance:f.guide.stance,
          defensive:!!f.guide.scriptDefensive,trace:f.trace,
          views:window.p012GuideArrivalViews,elapsed:f.frames/30,view};
      });
      if(result.arrived&&result.gap<3)break;
    }
    await fs.writeFile(path.join(outputDir,`Data_P012GuideFixtureB${beat}.json`),JSON.stringify({setup,result},null,2));
    await page.screenshot({path:path.join(outputDir,`Scene_P012GuideFixtureB${beat}.png`)});
    Check(setup.hadDefense&&result.arrived&&result.gap<3&&!result.defensive,
      `B${beat} 实际班长解除旧防守并通过真实AI/碰撞抵达，玩家跟随脚步`,JSON.stringify({elapsed:result.elapsed,guide:result.guide,gap:result.gap}));
    if(beat===22){
      Check(setup.b20?.every(actor=>actor.groundError<.08&&actor.crosshairAngle>.08),
        "B20 友军实体走到平地槽且不盖玩家准星",JSON.stringify(setup.b20));
      const maxStill=result.trace.reduce((state,sample)=>{const moved=Math.hypot(sample.guide[0]-state.point[0],sample.guide[2]-state.point[2]);return moved>.25?{point:sample.guide,at:sample.at,max:state.max}:{...state,max:Math.max(state.max,sample.at-state.at)};},{point:result.trace[0].guide,at:result.trace[0].at,max:0}).max;
      Check(maxStill<8,"B22 正常连续跟随没有超过 8 秒无位移",`${maxStill.toFixed(2)}s`);
      Check(result.view?.fov===55&&Math.abs(result.view.guideScreen[0])<1&&Math.abs(result.view.guideScreen[1])<1
        &&Math.abs(result.view.blockadeScreen[0])<1&&Math.abs(result.view.blockadeScreen[1])<1,
        "B22 正常 55° 视角同帧读到班长和截断线",JSON.stringify(result.view));
      Check(!result.view?.nearCenterWall,"B22 正常视角中心没有被近墙遮满");
    }
    if(beat===14)Check(result.stance===1,"侧路引导抵达后蹲候，不替玩家继续侧绕");
    if(beat===23){
      const smoke=await page.evaluate(()=>{
        const g=window.Tengxian,f=window.p012GuideFixture;
        const before={fact:f.flow.facts.has("retreatSmokeDeployed"),guide:g.story.Signalled("P012GuideAtSmoke"),released:!f.runtime.guide};
        g.StepFrames(90,1/30,false);
        const stillWaiting=!!f.runtime.guide&&!f.flow.facts.has("retreatSmokeDeployed");
        g.player.pitch=-.2;
        // Arrival at the leader is not automatically within arm's reach of
        // the prop. Continue toward the visible leader until the real prompt
        // appears; do not read the hidden objective coordinate or widen reach.
        let query=g.interact.Query(g.player)?.point?.id,approachFrames=0;
        while(query!=="p012_retreatSmoke"&&approachFrames<90){
          const at=f.guide.position,player=g.player.position;
          g.player.yaw=Math.atan2(-(at.x-player.x),-(at.z-player.z));
          g.Debug.Key("KeyW",Math.hypot(at.x-player.x,at.z-player.z)>1);
          g.StepFrames(1,1/30,false);approachFrames++;
          query=g.interact.Query(g.player)?.point?.id;
        }
        g.Debug.Key("KeyW",false);
        g.Debug.Key("KeyF",true);g.StepFrames(120,1/30,false);g.Debug.Key("KeyF",false);g.StepFrames(1);
        return {before,stillWaiting,query,approachFrames,fact:f.flow.facts.has("retreatSmokeDeployed"),smoke:f.runtime.Sample().retreatSmokeActive,
          released:!f.runtime.guide,handoff:g.story.Signalled("P012GuideSmokeHandoff"),views:window.p012GuideArrivalViews};
      });
      await fs.writeFile(path.join(outputDir,"Data_P012GuideFixtureSmoke.json"),JSON.stringify(smoke,null,2));
      await page.screenshot({path:path.join(outputDir,"Scene_P012GuideFixtureSmoke.png")});
      Check(!smoke.before.fact&&smoke.before.guide&&!smoke.before.released&&smoke.stillWaiting
        &&smoke.query==="p012_retreatSmoke"&&smoke.fact&&smoke.smoke&&smoke.released&&smoke.handoff,
        "烟幕点真实F完成后才释放班长引导并交接",JSON.stringify(smoke));
    }
  }
}

// 独立物理夹具可重置出生位置；不计入顺序通关或节奏证据。
async function VerifyTraversalFixtures() {
  for (const [kind, point] of Object.entries(P012_ANCHORS.traversal)) {
    const result = await page.evaluate(({ kind, point }) => {
      const game = window.Tengxian;
      game.player.Spawn(point.x, point.z + (kind === "step" ? 1.3 : 0.9), 0);
      game.StepFrames(20, 1 / 60, false);
      const before = game.Debug.Vault();
      const jumpBefore = game.Debug.Jump().count;
      let peak = game.player.position.y;
      game.Debug.Key("KeyW", true);
      if (kind !== "step") game.Debug.Key("Space");
      for (let frame = 0; frame < 160; frame += 1) {
        game.StepFrames(1, 1 / 60, false);
        peak = Math.max(peak, game.player.position.y);
      }
      game.Debug.Key("KeyW", false);
      game.StepFrames(1);
      return { before, after: game.Debug.Vault(), peak, jumpCount: game.Debug.Jump().count - jumpBefore,
        position: game.player.position.toArray() };
    }, { kind, point });
    Check(result.position[2] < point.z - 0.8, `${kind} 色块可由对应真实动作越过`, JSON.stringify(result));
    if (kind === "step") Check(result.jumpCount === 0, "黄色跨步无需按跳跃");
    else Check(result.after.count > result.before.count && result.after.kind === kind,
      `${kind} 色标与引擎动作分类一致`, JSON.stringify(result));
    await page.screenshot({ path: path.join(outputDir, `Scene_P012Traversal${kind[0].toUpperCase()}${kind.slice(1)}.png`) });
  }
}

// Dedicated P2 plan-view evidence, after gameplay checks; the menu owns this camera.
async function CaptureLayoutOverview() {
  const view = await page.evaluate(async () => {
    const {FIRST_LEVEL_P012_LAYOUT:layout}=await import("./Data_FirstLevelP012Layout.mjs");
    const game = window.Tengxian;
    game.Debug.Pause();
    const menu = game.menu;
    menu.live = true; menu.open = true; game.state.menu = true;
    menu.shotSliceId = menu.host.SlicePhase().id;
    const b=layout.bounds,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2,height=Math.max(b.maxX-b.minX,b.maxZ-b.minZ)*1.4;
    menu.shots = [{ id: "P012Overview", from: [x, height, z], to: [x, height, z],
      look: [x, 0, z], lookTo: [x, 0, z], focalMm: 24 }];
    menu.shotIndex = 0; menu.shotTime = 0;
    game.camera.up.set(0, 0, -1); game.camera.far = height+600; game.camera.updateProjectionMatrix();
    document.getElementById("menu").style.display = "none";
    game.viewmodel.root.visible = false;
    menu.ApplyShot(0); game.StepFrames(12);
    return { position: game.camera.position.toArray(), colliders: game.battlefield.colliders.length };
  });
  Check(view.position[1] > 250 && view.colliders > 15, "P2 俯视图使用实际已构建关卡", JSON.stringify(view));
  await page.screenshot({ path: path.join(outputDir, "Scene_P012LayoutOverview.png") });
}

// Normal audio-enabled entry. This verifies decoded assets, actual WebAudio
// output and bark suppression, not a subjective listening/mix approval.
async function VerifyAudioPlayback() {
  await page.waitForFunction(() => {
    const audio = window.Tengxian.audio;
    return audio.Ready && !audio.voiceLoading && !audio.sfxLoading;
  }, null, { timeout: 120000 });
  const samples = await page.evaluate(() => {
    const game = window.Tengxian, audio = game.audio;
    const keys = [...new Set([...game.story.queue, ...(game.story.p012Immediate || [])]
      .map(cue => cue.voice).filter(Boolean))];
    const missing = keys.filter(key => !audio.voiceBank.has(key));
    const barkBefore = audio.barkCounter;
    const attempts = ["nra", "ija"].flatMap(side => ["hurt", "spot", "ammo", "rally"]
      .map(kind => ({ side, kind, blocked: audio.Bark(kind, { side }) === null })));
    audio.StopAmbience(); audio.StopMusic(); audio.StopStoryVoice();
    const analyser = audio.ctx.createAnalyser(); analyser.fftSize = 2048;
    audio.sfxUser.connect(analyser);
    const key = "ch0_junguan_04";
    const played = audio.PlayStoryVoice(key);
    const sources = played?.voice?.nodes.filter(node => node.buffer) || [];
    window.p012AudioProbe = { analyser, data: new Float32Array(analyser.fftSize),
      peakRms: 0, ended: false, startedAt: audio.ctx.currentTime, endedAt: null };
    sources[0]?.addEventListener("ended", () => {
      window.p012AudioProbe.ended = true;
      window.p012AudioProbe.endedAt = audio.ctx.currentTime;
    });
    return { enabled: audio.enabled, ready: audio.Ready, keys: keys.length, missing,
      errors: [...audio.voiceErrors, ...audio.sfxErrors], attempts,
      barkCountUnchanged: barkBefore === audio.barkCounter,
      key, duration: played?.duration, sourceCount: sources.length,
      sampledCues: ["trainBrake", "carriageDoorSlide", "stretcherWood", "stepBallast"]
        .filter(cue => audio.sampleCues.has(cue)) };
  });
  Check(samples.enabled && samples.ready, "正常入口解锁真实 AudioContext");
  Check(samples.keys > 40 && !samples.missing.length && !samples.errors.length,
    "P012 剧情音频真实加载且解码", JSON.stringify({ keys: samples.keys, missing: samples.missing, errors: samples.errors }));
  Check(samples.attempts.every(attempt => attempt.blocked) && samples.barkCountUnchanged,
    "双方自主喊话被播放入口阻止，未占用喊话节流槽");
  Check(samples.sampledCues.length === 4, "列车与担架等关键已有采样可用");
  Check(samples.sourceCount > 0 && samples.duration > 0, "剧情对白建立真实采样源", JSON.stringify(samples));
  await page.waitForFunction(() => {
    const probe = window.p012AudioProbe;
    probe.analyser.getFloatTimeDomainData(probe.data);
    const rms = Math.sqrt(probe.data.reduce((sum, value) => sum + value * value, 0) / probe.data.length);
    probe.peakRms = Math.max(probe.peakRms, rms);
    return probe.ended;
  }, null, { timeout: 30000 });
  const output = await page.evaluate(() => {
    const probe = window.p012AudioProbe;
    window.Tengxian.audio.sfxUser.disconnect(probe.analyser);
    return { peakRms: probe.peakRms, duration: probe.endedAt - probe.startedAt };
  });
  Check(output.peakRms > 0.00001, "剧情对白在混音输出端产生非零信号", JSON.stringify(output));
  Check(output.duration >= samples.duration - 0.1, "实际对白自然播完，没有被自主喊话截断");
  await fs.writeFile(path.join(outputDir, "Data_P012AudioPlayback.json"), JSON.stringify({ samples, output,
    scope: "real playback/suppression smoke only; not subjective listening approval" }, null, 2));
}

try {
  if(savedInfiniteAmmo)await page.addInitScript(()=>localStorage.setItem("tengxian1938_debug_options_v1",JSON.stringify({infiniteAmmo:true})));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&${audioSmoke ? "audio=1" : "shot=1"}&manual=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
  if (audioSmoke) await page.click("#bootStart");
  await page.evaluate(enabled=>{window.p012TrainReview=enabled;},trainReview);
  await page.evaluate(async ({openingPhotoPoints,platformBounds}) => {
    const game = window.Tengxian, originalHit = game.player.TakeHit;
    const {FirstLevelP012Runtime}=await import("./Script_FirstLevelP012Runtime.mjs");
    const originalIssue=FirstLevelP012Runtime.prototype.StepOpeningCast;
    window.p012EquipmentCallbacks=[];window.p012OpeningIssueTrace=[];window.p012TrainTrace=[];window.p012TrainCaptures=[];
    FirstLevelP012Runtime.prototype.StepOpeningCast=function(...args){
      if(!this.host.p012TestIssueObserved){
        this.host.p012TestIssueObserved=true;
        const original=this.host.SetOpeningEquipment;
        this.host.SetOpeningEquipment=function(actor,stage){
          const result=original?.call(this,actor,stage);
          window.p012EquipmentCallbacks.push({at:game.Debug.P012().elapsed,id:actor.id,stage,
            unarmed:actor.unarmed,ammo:actor.ammo,weapon:actor.weaponId,position:actor.position.toArray()});
          return result;
        };
      }
      return originalIssue.apply(this,args);
    };
    window.p012DamageTrace = [];
    window.p012GuidanceHudTrace = [];
    window.p012GuideArrivalViews = [];
    window.p012ActivityTrace = [];
    window.p012AirViews = [];
    window.p012TrafficViews = [];
    window.p012TrafficCapturedBeats = [];
    window.p012PopulationMax = { armed: 0, unarmed: 0,rawArmed:0,aiRawUnarmed:0,rawUnarmed:0,resting:0,trainExtras:0,children:0,temporaryUnissuedSoldiers:0,civilianWounded:0 };
    window.p012CrowdFireCues = [];
    window.p012AirGroundShots = [];
    window.p012AirImpacts = [];
    window.p012EscortApproval = [];
    window.p012PrematureEscortMovement = [];
    window.p012SouthGrenadeExplosions = [];
    const originalDetonate = game.combat.Detonate;
    game.combat.Detonate = function (projectile) {
      const before = game.Debug.P012();
      const result = originalDetonate.call(this, projectile);
      if (before.beatIndex === 21 && projectile.owner === "player") {
        const after = game.Debug.P012();
        window.p012SouthGrenadeExplosions.push({ at: after.elapsed,
          position: projectile.position.toArray(), kind: projectile.kind,
          effect: JSON.stringify(before.lastSouthGrenadeEffect) !== JSON.stringify(after.lastSouthGrenadeEffect)
            ? after.lastSouthGrenadeEffect || null : null });
      }
      return result;
    };
    const originalSignal = game.story.Signal;
    game.story.Signal = function (name, ...args) {
      const result = originalSignal.call(this, name, ...args);
      if (name === "P012CrowdFire") {
        const flow = game.Debug.P012();
        window.p012CrowdFireCues.push({ at: flow.elapsed, beat: flow.beat, text: flow.objective.text });
      }
      if (["P012EscortRequested", "P012EscortApproved", "EscortCall"].includes(name)) {
        window.p012EscortApproval.push({ at: game.Debug.P012().elapsed, event: name,
          column: game.Debug.P012Scene().columnPosition });
      }
      return result;
    };
    const originalStoryPlay = game.story.Play;
    game.story.Play = function (beat, ...args) {
      const result = originalStoryPlay.call(this, beat, ...args);
      if(beat.p012SubtitleOnly&&beat.voice?.startsWith("p012_text_Guide")){
        const guide=game.ai.soldiers.find(actor=>actor.castId==="luo");
        const view={id:beat.voice.slice("p012_text_".length),at:game.Debug.P012().elapsed,text:beat.text,
          beat:game.Debug.P012().beat,player:game.player.position.toArray(),camera:game.camera.position.toArray(),
          guide:guide?{id:guide.id,alive:guide.alive,position:guide.position.toArray(),stance:guide.stance}:null,
          scope:window.p012GuideFixture
            ?"explicit stage fixture with initial placement; actual played subtitle and subsequent live player camera"
            :"actual played subtitle and ordinary live player camera; no placement or delayed settling"};
        window.p012GuideArrivalViews.push(view);window.p012PendingGuideView=view;
      }
      if (beat.voice === "ch1_luo_08") {
        const voice = this.voiceLog.at(-1);
        window.p012EscortApproval.push({ at: game.Debug.P012().elapsed, event: "LuoApprovalStarted",
          played: voice?.key === beat.voice && voice.played, duration: voice?.key === beat.voice ? voice.dur || 0 : 0 });
      }
      return result;
    };
    const originalAirImpact = game.strafe.EmitImpact;
    game.strafe.EmitImpact = function (...args) {
      const before = this.stats.impacts;
      const result = originalAirImpact.apply(this, args);
      if (this.stats.impacts > before) {
        const air = this.View();
        window.p012AirImpacts.push({ at: game.Debug.P012().elapsed, runId: air?.id,
          preset: air?.presetId, flightTime: air?.t, point: air?.impact });
      }
      return result;
    };
    const originalAiFire = game.ai.TryFire;
    game.ai.TryFire = function (soldier, ...args) {
      const before = soldier.fireSequence;
      const result = originalAiFire.call(this, soldier, ...args);
      const flow = game.Debug.P012(), air = game.Debug.Strafe.State().run;
      if (soldier.side === "ija" && soldier.fireSequence !== before && flow.beatIndex >= 16 && flow.beatIndex <= 20) {
        window.p012AirGroundShots.push({ at: flow.elapsed, beat: flow.beat, actor: soldier.id,
          runId: air?.id ?? null,
          targetPlayer: !!soldier.target?.isPlayer, preset: air?.presetId || null,
          targetNearPlayer: soldier.target?.position?.distanceTo?.(game.player.position) < 12,
          phase: air?.phase || null, firing: air?.firing || false, flightTime: air?.t ?? null });
      }
      return result;
    };
    const originalStep = game.StepFrames;
    let lastShotAt = -Infinity;
    let previousShots = game.state.playerShots;
    let lastAirViewAt = -Infinity;
    let lastTrafficViewAt = -Infinity;
    const previousTraffic = new Map();
    game.StepFrames = function (count = 1, dt = 1 / 60, render = true) {
      for (let frame = 0; frame < count; frame += 1) {
        const before = game.Debug.P012(), position = game.player.position.clone();
        const waitingApproval = before.beatIndex === 12 && !game.story.Signalled("P012EscortApproved");
        const waitingColumn = waitingApproval ? game.Debug.P012Scene().columnPosition : null;
        originalStep(1, dt, render);
        const after = game.Debug.P012(), spans = window.p012ActivityTrace;
        if (waitingColumn && !game.story.Signalled("P012EscortApproved")) {
          const column = game.Debug.P012Scene().columnPosition;
          if (Math.hypot(column.x - waitingColumn.x, column.z - waitingColumn.z) > 0.01)
            window.p012PrematureEscortMovement.push({ at: after.elapsed, before: waitingColumn, after: column });
        }
        if (after.elapsed < before.elapsed) {
          while (spans.length && spans.at(-1).from >= after.elapsed) spans.pop();
          if (spans.length) spans.at(-1).to = Math.min(spans.at(-1).to, after.elapsed);
          lastShotAt = -Infinity;
          previousShots = game.state.playerShots;
          continue;
        }
        if (after.elapsed <= before.elapsed) continue;
        const friendly = game.ai.soldiers.filter(actor => actor.alive && actor.side === "nra");
        const openingScene=game.Debug.P012Scene(),openingCast=openingScene.openingCast||[];
        const trainColumn=(openingScene.trainColumn||[]).map(({actor,...entry})=>entry);
        const extraIds=new Set(trainColumn.filter(entry=>entry.extra).map(entry=>entry.actorId));
        const temporaryIds=new Set(openingCast.filter(entry=>!entry.weaponIssued).map(entry=>entry.actorId));
        const temporary=friendly.filter(actor=>actor.unarmed&&temporaryIds.has(actor.id)).length;
        const aiRawUnarmed=friendly.filter(actor=>actor.unarmed).length;
        const resting=openingScene.resting?.count||0;
        const stageZeroPeople=openingScene.stageZero?.village?.actors.length||0;
        const rawUnarmed=aiRawUnarmed+resting+stageZeroPeople;
        window.p012PopulationMax.stageZeroPeople=Math.max(window.p012PopulationMax.stageZeroPeople||0,stageZeroPeople);
        window.p012PopulationMax.armed = Math.max(window.p012PopulationMax.armed, friendly.filter(actor => !actor.unarmed&&!extraIds.has(actor.id)).length);
        window.p012PopulationMax.unarmed = Math.max(window.p012PopulationMax.unarmed,friendly.filter(actor=>actor.unarmed&&!actor.actor?.isChild&&!temporaryIds.has(actor.id)&&!extraIds.has(actor.id)).length);
        window.p012PopulationMax.rawArmed=Math.max(window.p012PopulationMax.rawArmed,friendly.filter(actor=>!actor.unarmed).length);
        window.p012PopulationMax.trainExtras=Math.max(window.p012PopulationMax.trainExtras,friendly.filter(actor=>extraIds.has(actor.id)).length);
        window.p012PopulationMax.children=Math.max(window.p012PopulationMax.children,friendly.filter(actor=>actor.actor?.isChild).length);
        window.p012PopulationMax.civilianWounded=window.p012PopulationMax.unarmed;
        window.p012PopulationMax.aiRawUnarmed=Math.max(window.p012PopulationMax.aiRawUnarmed,aiRawUnarmed);
        window.p012PopulationMax.resting=Math.max(window.p012PopulationMax.resting,resting);
        window.p012PopulationMax.rawUnarmed=Math.max(window.p012PopulationMax.rawUnarmed,rawUnarmed);
        window.p012PopulationMax.temporaryUnissuedSoldiers=Math.max(window.p012PopulationMax.temporaryUnissuedSoldiers,temporary);
        if(after.elapsed-(window.p012LastTrainAt??-1)>=.5){
          window.p012LastTrainAt=after.elapsed;
          const hudSample={at:after.elapsed,beat:after.beat,
            markerCount:document.querySelectorAll(".hudMarker").length,
            promptKeys:game.Debug.Prompts().map(prompt=>prompt.keys),
            promptKinds:game.Debug.Prompts().map(prompt=>prompt.kind),
            targetMeta:game.hud.TargetState()?.meta||"",
            targetDomMeta:document.querySelector(".hudTarget .tMeta")?.textContent||"",
            guidePosition:openingScene.guidePosition,guideAlive:openingScene.guideAlive,
            northRegroup:openingScene.northRegroup,
            cast:openingCast.map(entry=>({actorId:entry.actorId,stage:entry.stage,marchComplete:entry.marchComplete,
              position:entry.position,defense:entry.marchDefensePoint}))};
          window.p012GuidanceHudTrace.push(hudSample);
          if(hudSample.markerCount||hudSample.promptKeys.includes("X")||/\d+m\b/.test(hudSample.targetMeta)||/\d+m\b/.test(hudSample.targetDomMeta)
            ||(after.beatIndex<6&&hudSample.promptKinds.includes("melee")))
            throw new Error(`Unexpected floating destination or permanent X prompt: ${JSON.stringify(hudSample)}`);
          const record={at:after.elapsed,beat:after.beat,player:game.player.position.toArray(),trainColumn,
            rawActors:game.ai.soldiers.map(actor=>({id:actor.id,alive:actor.alive,side:actor.side,unarmed:actor.unarmed,
              kind:actor.actor?.kind,variant:actor.actor?.variant,height:actor.actor?.height,
              position:actor.position.toArray(),state:actor.state,shots:actor.fireSequence||0,scriptedNoncombatant:actor.scriptedNoncombatant})),
            rawPopulation:{aiTotal:game.ai.soldiers.length,total:game.ai.soldiers.length+resting,
              aiFriendly:friendly.length,friendly:friendly.length+resting,armed:friendly.filter(actor=>!actor.unarmed).length,
              aiRawUnarmed,unarmed:rawUnarmed,resting,
              adultCivilianWounded:friendly.filter(actor=>actor.unarmed&&!actor.actor?.isChild&&!temporaryIds.has(actor.id)&&!extraIds.has(actor.id)).length}};
          window.p012TrainTrace.push(record);
          if(window.p012TrainReview&&!window.p012PendingTrainView)for(const carIndex of [0,1,2]){
            const car=trainColumn.filter(entry=>entry.carIndex===carIndex),id=`Car${carIndex}Exited`;
            if(car.length&&car.every(entry=>entry.exitDone)&&!window.p012TrainCaptures.includes(id)){
              window.p012TrainCaptures.push(id);window.p012PendingTrainView={id,...record,
                scope:"actual player camera at physical car exit completion, not a guaranteed view of every actor"};break;
            }
          }
        }
        if (after.beatIndex <= 2 && after.elapsed - lastTrafficViewAt >= .5) {
          lastTrafficViewAt = after.elapsed;
          window.p012OpeningIssueTrace.push({at:after.elapsed,player:game.player.position.toArray(),cast:openingCast});
          const actors = friendly.filter(actor => actor.p012TrafficSide !== undefined).map(actor => {
            const at = actor.position.clone(); at.y += 1.2;
            const screen = at.clone().project(game.camera), delta = at.sub(game.player.EyePosition), distance = delta.length();
            const hit = game.battlefield.Raycast(game.player.EyePosition, delta.normalize(), distance);
            const previous = previousTraffic.get(actor.id);
            previousTraffic.set(actor.id, { at: after.elapsed, x: actor.position.x, z: actor.position.z });
            const walker=openingScene.traffic?.find(entry=>entry.actorId===actor.id);
            return { id: actor.id, side: actor.p012TrafficSide, role: actor.escortRole,
              kind:actor.actor?.kind,variant:actor.actor?.variant,height:actor.actor?.height,bodyRadius:actor.body?.radius,
              unarmed:actor.unarmed,familyId:walker?.familyId,guardianSlot:walker?.guardianSlot,slot:walker?.slot,
              plannedSpeedMps:walker?.speedMps,lateralM:walker?.lateralM,
              position: actor.position.toArray(), distance,
              speedX: previous ? (actor.position.x - previous.x) / (after.elapsed - previous.at) : 0,
              speedZ: previous ? (actor.position.z - previous.z) / (after.elapsed - previous.at) : 0,
              visible: screen.z >= -1 && screen.z <= 1 && Math.abs(screen.x) < .95 && Math.abs(screen.y) < .95
                && (!hit || hit.t >= distance - .3) };
          });
          const view = { at: after.elapsed, beat: after.beat, player: game.player.position.toArray(),
            yaw: game.player.yaw, pitch: game.player.pitch, actors, population: { ...window.p012PopulationMax },
            platformBounds,platformCivilians:actors.filter(actor=>actor.role==="civilian"
              &&Math.abs(actor.position[0]-platformBounds.x)<=platformBounds.w/2
              &&Math.abs(actor.position[2]-platformBounds.z)<=platformBounds.d/2).map(actor=>actor.id) };
          window.p012TrafficViews.push(view);
          const movingVisible = actors.filter(actor => actor.visible && actor.distance < 24
            && Math.hypot(actor.speedX, actor.speedZ) > .2);
          const opposed = movingVisible.some(north => north.side === 0 && movingVisible.some(south => south.side === 1
            && north.speedX * south.speedX + north.speedZ * south.speedZ < -.25));
          const dense = movingVisible.filter(actor => actor.role === "civilian").length >= 2
            && movingVisible.filter(actor => actor.side === 0).length >= 2;
          view.captureId = after.beat + (dense ? "Crowd" : "");
          if (!window.p012TrafficCapturedBeats.includes(view.captureId) && opposed) {
            window.p012TrafficCapturedBeats.push(view.captureId);
            window.p012PendingTrafficView = view;
          }
          // Capture the actual player's unmodified view at three spatial
          // milestones even when the crowd is not yet visible; never select
          // a flattering camera or turn a missing crowd into a passing fact.
          const place=openingPhotoPoints.find(point=>after.beatIndex===point.beat
            &&Math.hypot(game.player.position.x-point.x,game.player.position.z-point.z)<point.radius
            &&!window.p012TrafficCapturedBeats.includes(point.id));
          if(place&&!window.p012PendingTrafficView){
            window.p012TrafficCapturedBeats.push(place.id);
            window.p012PendingTrafficView={...view,captureId:place.id,
              scope:"actual prelude player viewpoint; no position, camera or fact writes"};
          }
        }
        if (after.beatIndex >= 15 && after.beatIndex <= 20 && after.elapsed - lastAirViewAt >= 0.25) {
          lastAirViewAt = after.elapsed;
          const airState = game.Debug.Strafe.State(),air=airState.run;
          if (air?.active) {
            const Visible = (point) => {
              const at = game.player.position.clone().set(point.x, point.y, point.z);
              const projected = at.clone().project(game.camera);
              if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 0.95 || Math.abs(projected.y) > 0.95) return false;
              const delta = at.sub(game.player.EyePosition), distance = delta.length();
              const hit = game.battlefield.Raycast(game.player.EyePosition, delta.normalize(), distance);
              return !hit || hit.t >= distance - 0.5;
            };
            const members = game.Debug.P012Scene().columnActors;
            const visible = members.filter(member => Visible({ x: member.x, y: 1.2, z: member.z }));
            const cart=game.battlefield.gates.get("AirRoadCartObstacle");
            const view = { at: after.elapsed, beat: after.beat, runId: air.id, preset: air.presetId, phase: air.phase,
              objectiveText: after.objective.text, crowdFire: game.story.Signalled("P012CrowdFire"),
              flightTime: air.t, airVisible: airState.modelVisible===true&&!!airState.modelAt&&Visible(airState.modelAt),
              modelVisible:airState.modelVisible,modelAt:airState.modelAt,airPosition: air.aircraft,
              player: game.player.position.toArray(), yaw: game.player.yaw, pitch: game.player.pitch,
              members:members.map(member=>({...member,visible:visible.includes(member)})),
              cartObstacle:cart?{open:cart.open,visible:cart.mesh.visible,colliding:game.battlefield.colliders.includes(cart.collider)}:null,
              bearersVisible: visible.filter(member => member.role === "bearer").length,
              civiliansVisible: visible.filter(member => member.role === "civilian").length };
            window.p012AirViews.push(view);
            if (!window.p012JointAirView && view.preset === "crowdTurn" && view.phase === "approach"
              && view.airVisible && view.bearersVisible >= 2 && view.civiliansVisible >= 1) window.p012JointAirView = view;
          }
        }
        if (game.state.playerShots > previousShots) lastShotAt = after.elapsed;
        previousShots = game.state.playerShots;
        const enemyFire = game.ai.soldiers.some(soldier => soldier.alive && soldier.side === "ija"
          && game.ai.time - soldier.lastFire < 3 && soldier.target
          && (soldier.target.isPlayer || soldier.target.position?.distanceTo?.(game.player.position) < 12));
        const moving = Math.hypot(game.player.position.x - position.x, game.player.position.z - position.z) > 0.002;
        const observationProgress = before.beat === after.beat
          && before.objective.requiredAction === "observe"
          && Number.isFinite(before.objective.progress?.value)
          && Number.isFinite(after.objective.progress?.value)
          && after.objective.progress.value > before.objective.progress.value;
        const milestone = before.beat !== after.beat || before.facts.length !== after.facts.length
          || before.signals.length !== after.signals.length;
        const kind = enemyFire || after.elapsed - lastShotAt < 3 ? "combat" : moving ? "moving"
          : game.Debug.Interact().hold ? "interaction" : game.viewmodel.IsBusy?.() ? "weaponAction"
            : observationProgress ? "observation" : milestone ? "milestone" : "stationary";
        const last = spans.at(-1);
        if (last && last.kind === kind && last.beat === before.beat && Math.abs(last.to - before.elapsed) < 0.001) last.to = after.elapsed;
        else spans.push({ from: before.elapsed, to: after.elapsed, beat: before.beat, kind });
      }
    };
    game.player.TakeHit = function (...args) {
      const before = this.health, position = this.position.toArray(), stance = this.stance;
      const result = originalHit.apply(this, args);
      if (this.health < before) window.p012DamageTrace.push({ at: game.Debug.P012().elapsed,
        beat: game.Debug.P012().beat, position, stance, damage: before - this.health,
        part: args[1], from: args[3]?.from?.toArray?.() || null,
        bullet: !!args[3]?.bullet, blast: !!args[3]?.blast });
      return result;
    };
  },{openingPhotoPoints:[
    {id:"StationPlatform",...P012StationPoint(-56,55),beat:0,radius:3},
    {id:"StationNorthExit",...P012StationPoint(-43,35),beat:2,radius:4},
    {id:"VillageGroup",x:-30,z:62,beat:2,radius:4},
  ],platformBounds:FIRST_LEVEL_P012_LAYOUT.blocks.find(block=>block.id==="StationPlatformApron")});
  if(spatialReview) await page.evaluate(()=>{
    const game=window.Tengxian,original=game.StepFrames,captured=new Set();
    game.StepFrames=function(count=1,dt=1/60,render=true){
      for(let i=0;i<count;i++){
        original(1,dt,render);
        const flow=game.Debug.P012(),p=game.player.position;
        if(flow.beatIndex!==2||window.p012PendingSpatialView)continue;
        for(const [id,z] of [["SouthBend",80],["MiddleCourt",46],["NorthBend",24],["HubReveal",12]]){
          if(p.z>z||captured.has(id))continue;
          captured.add(id);window.p012PendingSpatialView={id,at:flow.elapsed,position:p.toArray(),
            yaw:game.player.yaw,pitch:game.player.pitch,routeIndex:flow.routeIndex,
            scope:"normal prelude walking camera; screenshot capture does not move player or actors"};break;
        }
      }
    };
  });
  if(process.argv.includes("--stage-zero-review"))await page.evaluate(()=>{
    const game=window.Tengxian,original=game.StepFrames,captured=new Set();
    window.p012StageZeroCaptures=[];
    game.StepFrames=function(count=1,dt=1/60,render=true){
      for(let i=0;i<count;i++){
        original(1,dt,render);
        if(window.p012PendingStageZeroView)continue;
        const snapshot=game.Debug.P012Scene()?.stageZero;if(!snapshot)continue;
        const arrival=snapshot.arrival,village=snapshot.village,speech=game.story.p012PendingCompletion;
        const ids=[];
        if(arrival.phase==="braking"&&arrival.referenceTravelM>50&&snapshot.approach?.visible)ids.push("ArrivalApproach");
        if(arrival.phase==="door"&&arrival.doorProgress>.3)ids.push("ArrivalDoor");
        if(arrival.fade>.7)ids.push("ArrivalTitle");
        for(const item of village.vignettes.filter(item=>item.visible)) {
          if(item.id==="DoorStretcher"){
            if(item.state==="lowering")ids.push("DoorLowering");
            if(item.state==="stretcherReady")ids.push("DoorReady");
          }else ids.push(item.id);
        }
        if(speech?.key.startsWith("p012_text_Hub"))ids.push(speech.key);
        const id=ids.find(id=>!captured.has(id));if(!id)continue;
        captured.add(id);window.p012StageZeroCaptures.push(id);
        window.p012PendingStageZeroView={id,at:game.Debug.P012().elapsed,player:game.player.position.toArray(),yaw:game.player.yaw,
          snapshot,subtitle:document.querySelector(".hudSubtitle")?.textContent,scope:"ordinary walking camera, no actor/camera placement"};
      }
    };
  });
  if(stationReview) await page.evaluate(({platformLimit,door,heights})=>{
    const game=window.Tengxian,originalStep=game.StepFrames;
    window.p012StationTrace=[];window.p012StationViews=[];
    const captures=new Set();
    const Record=()=>{
      const flow=game.Debug.P012();
      if(flow.beatIndex>2)return;
      const leader=game.ai.soldiers.find(actor=>actor.castId==="luo");
      const scene=game.Debug.P012Scene(),p=game.player.position;
      const sample={at:flow.elapsed,beat:flow.beat,player:{x:p.x,y:p.y,z:p.z},
        groundAt:game.battlefield.GroundHeight(p.x,p.z),
        luo:leader?{x:leader.position.x,y:leader.position.y,z:leader.position.z}:null,
        luoGroundAt:leader?game.battlefield.GroundHeight(leader.position.x,leader.position.z):null,
        doorOpen:game.story.Signalled("P012TrainDoor"),routeIndex:flow.routeIndex,
        guideRouteIndex:scene.guideRouteIndex,guidePosition:scene.guidePosition,
        objectiveTarget:flow.objective.target};
      window.p012StationTrace.push(sample);
      // The ordinary driver stops inside the public arrival radius (observed
      // x=-47.59 for target -47), not beyond the target's world X coordinate.
      // Capture the actual reached platform objective, never demand an extra
      // unrequested step or reposition the player just for a photograph.
      const target=flow.objective.target;
      const platformReached=flow.beatIndex===2&&flow.facts.includes("issuedAmmo")&&target
        &&p.x>platformLimit.x&&p.z<platformLimit.z&&Math.abs(p.y-sample.groundAt)<.1
        &&Math.hypot(p.x-target.x,p.z-target.z)<=Math.max(.9,flow.objective.arrivalRadiusM||0);
      const id=p.x>-63.7&&p.x<-60&&Math.abs(p.z-door.z)<1.5&&Math.abs(sample.groundAt-heights.exitTops[2])<.001
        &&Math.abs(p.y-heights.exitTops[2])<.1?"Descent":platformReached?"Platform":null;
      if(id&&!captures.has(id)&&!window.p012PendingStationView){
        captures.add(id);window.p012PendingStationView={id,sample};
      }
    };
    Record();
    game.StepFrames=function(count=1,dt=1/60,render=true){
      for(let i=0;i<count;i++){originalStep(1,dt,render);Record();}
    };
  },{platformLimit:P012StationPoint(-50,43),door:P012_ANCHORS.trainDoor,heights:P012_STATION_HEIGHTS});
  if (process.argv.includes("--voice-timing")) {
    const durations = Object.fromEntries([...prologueVoices, ...chapterVoices].map(line => [line.key, line.dur]));
    const count = await page.evaluate(durations => {
      const story = window.Tengxian.story;
      // Silent deterministic narration timing, not an audio-output verification.
      // Use checked-in recording durations; leave production sequencing and hooks intact.
      story.voicePlay = ({ key }) => Number.isFinite(durations[key]) ? { duration: durations[key] } : null;
      return Object.keys(durations).length;
    }, durations);
    Check(count > 60, "静音实跑使用已有对白的标注时长（不代表声音播放验收）", String(count));
  }
  const initial = await page.evaluate(() => {
    const game = window.Tengxian;
    game.StepFrames(2);
    return {
      state: game.Debug.Whitebox(),
      position: game.player.position.toArray(),
      autonomousBarkAllowed: game.audio.allowAutonomousBark?.(),
      storyVoices: game.story.queue.filter((beat) => beat.voice).length,
      cameraHeld: game.state.cutscene,
      colliders: game.battlefield.colliders.length,
      externalProps: game.battlefield.externalProps?.count || 0,
      trimProps: game.battlefield.trimProps?.count || 0,
    };
  });
  Check(initial.state.phase === "FirstLevelP012Whitebox", "独立 P012 query 正确进入新关卡");
  Check(initial.state.companions >= 3, "具名小队复用现有角色配置", String(initial.state.companions));
  Check(initial.state.enemyCount === 0, "兵站开局没有日军");
  Check(initial.autonomousBarkAllowed === false, "前期自主喊话被抑制");
  Check(initial.storyVoices > 0, "关键剧情对白仍保留", String(initial.storyVoices));
  Check(!initial.cameraHeld, "正常开局不锁定玩家镜头");
  const semantics = initial.state.field.coloredSemantics;
  Check(["ground", "step", "vault", "mantle", "cover", "boundary", "danger", "missionRoute", "stretcherRoute"]
    .every((semantic) => semantics.includes(semantic)), "全部通行语义使用独立颜色");
  Check(initial.state.field.externalAssets === 0 && initial.externalProps === 0 && initial.trimProps === 0 && initial.colliders > 15,
    "程序体块环境具有实际碰撞且不加载正式环境资产");
  await page.screenshot({ path: path.join(outputDir, "Scene_P012Arrival.png") });
  if(stationReview)await page.screenshot({path:path.join(outputDir,"Scene_P012StationCarInterior.png")});
  if(process.argv.includes("--village-fixture")){
    await page.evaluate(()=>{
      const game=window.Tengxian,target={x:-36.9,z:54};
      game.player.Spawn(-32.5,58.5,Math.atan2(-(target.x+32.5),-(target.z-58.5)));
      game.player.pitch=-.08;game.StepFrames(60,1/30,true);
    });
    const samples=[];
    for(const [seconds,frames] of [[0,0],[4,120],[7,90],[12,150]]){
      if(frames)await page.evaluate(count=>window.Tengxian.StepFrames(count,1/30,true),frames);
      const sample=await page.evaluate(()=>({at:window.Tengxian.Debug.P012().elapsed,stageZero:window.Tengxian.Debug.P012Scene().stageZero,
        scope:"explicit close village-work visual fixture; moves only the test player/camera, never actors, props, facts or production camera"}));
      samples.push(sample);await page.screenshot({path:path.join(outputDir,`Scene_P012VillageWork_${seconds}s.png`)});
    }
    await fs.writeFile(path.join(outputDir,"Data_P012VillageWork.json"),JSON.stringify(samples,null,2));
    const lowering=samples.find(sample=>sample.stageZero.village.door.state==="lowering");
    Check(!!lowering&&samples.at(-1).stageZero.village.door.state==="stretcherReady","真实村路工兵把门板逐段放平并绑成担架");
    Check(samples.filter(sample=>sample.stageZero.village.door.state!=="stretcherReady").every(sample=>sample.stageZero.village.workerPoses.every(worker=>worker.pose?.hands.length===2&&worker.pose.hands.every(hand=>!hand.unreachable&&hand.residual<.012))),
      "两名工兵用真实手臂骨骼接触移动门板，未拉长手臂");
  }
  if (openingGuidanceReview) await VerifyOpeningDiscovery();
  if (stationReview || openingCausalityReview || orientationReview || process.argv.includes("--prelude") || process.argv.includes("--pacing") || process.argv.includes("--frontline") || process.argv.includes("--campaign")) await PlayPrelude();
  if(process.argv.includes("--stage-zero-review")){
    const captures=await page.evaluate(()=>window.p012StageZeroCaptures||[]),required=["ArrivalApproach","ArrivalDoor","ArrivalTitle","WaitingWounded","DoorLowering","Telephone","MuleAmmo","FamilyCart"];
    Check(required.every(id=>captures.includes(id)),"普通跟队实跑依次看见到站、村路作业与家庭疏散",JSON.stringify(captures));
  }
  if (process.argv.includes("--frontline") || process.argv.includes("--campaign") || process.argv.includes("--pacing")) await PlayFrontline();
  if(process.argv.includes("--cast-review")) {
    const squad=await page.evaluate(()=>window.Tengxian.Debug.P012Scene().openingCast);
    Check(squad.length===6&&squad.every(person=>person.age>=18&&person.age<=23&&[1,3].includes(person.modelVariant)),
      "原有六名同行者（含无名队友）实际使用年轻身份与面孔",JSON.stringify(squad.map(({actorId,age,modelVariant})=>({actorId,age,modelVariant}))));
    const cast=await page.evaluate(()=>window.Tengxian.Debug.P012Scene().cast);
    for(const person of cast){
      const spec=P012_COMPANION_CAST[person.castId];
      Check(!!spec&&person.age===spec.age&&person.modelVariant===spec.modelVariant,`${person.castId} 实际身份与可见GLB采用固定选角`,JSON.stringify(person));
      await page.evaluate(id=>{
        const game=window.Tengxian,actor=game.ai.soldiers.find(actor=>actor.castId===id);
        // Explicit portrait fixture, never part of a pacing or campaign claim.
        const angle=actor.yaw,at=actor.position;
        game.player.Spawn(at.x-Math.sin(angle)*1.75,at.z-Math.cos(angle)*1.75,angle+Math.PI);
        game.StepFrames(1);
        let head=null;actor.actor.root.traverse(node=>{if(node.isBone&&/head$/i.test(node.name))head=node;});
        const face=head?head.getWorldPosition(at.clone()):at.clone().add({x:0,y:1.55,z:0});
        game.player.pitch=Math.atan2(face.y-game.player.EyePosition.y,Math.hypot(face.x-game.player.position.x,face.z-game.player.position.z));game.StepFrames(1);
      },person.castId);
      await page.screenshot({path:path.join(outputDir,`Scene_P012Cast_${person.castId}.png`)});
    }
    await fs.writeFile(path.join(outputDir,"Data_P012CastReview.json"),JSON.stringify({scope:"explicit close-up portrait fixture; actual existing named actors, no model replacement",cast},null,2));
  }
  if(process.argv.includes("--hub-view"))await VerifyHubGuideView();
  if(process.argv.includes("--air-model"))await VerifyAircraftModel();
  if(process.argv.includes("--machine-gun-crew"))await VerifyMachineGunCrew();
  if(process.argv.includes("--frontline-rejoin"))await VerifyFrontlineRejoin();
  if(process.argv.includes("--wounded-guide"))await VerifyWoundedGuide();
  else if(process.argv.includes("--road-cover"))await VerifyRoadCover();
  if(airRouteFixture)await VerifyAirRouteHandoff(airRouteFixture);
  if (process.argv.includes("--guide-handoffs")) await VerifyGuideHandoffs();
  if (process.argv.includes("--geometry")) await VerifyTraversalFixtures();
  if (process.argv.includes("--south-recovery")) await VerifySouthRouteRecoveryFixtures();
  if (process.argv.includes("--front-recovery")) await VerifyFrontlineRecoveryFixtures();
  if (process.argv.includes("--cast-colors")) await VerifyCastClothing();
  if (process.argv.includes("--scale-review")) await VerifyMapScale();
  if (process.argv.includes("--shot-alignment")) await VerifyTriggerAim();
  if (process.argv.includes("--overview")) await CaptureLayoutOverview();
  if (audioSmoke) await VerifyAudioPlayback();
  const traffic = await page.evaluate(() => ({ views: window.p012TrafficViews, population: window.p012PopulationMax }));
  const guidanceHud=await page.evaluate(()=>window.p012GuidanceHudTrace);
  await fs.writeFile(path.join(outputDir,"Data_P012GuidanceHud.json"),JSON.stringify(guidanceHud,null,2));
  Check(guidanceHud.length>0&&guidanceHud.every(sample=>sample.markerCount===0&&!sample.promptKeys.includes("X")&&!/\d+m\b/.test(sample.targetMeta)),
    "真实运行所有采样均无悬浮目标米数和常驻X；保留近处交互与字幕",`${guidanceHud.length} samples`);
  if(savedInfiniteAmmo){
    const ammoEvidence=await page.evaluate(()=>({saved:JSON.parse(localStorage.getItem("tengxian1938_debug_options_v1")),
      rifle:window.p012ReviewBot.rifleCaptured,issued:window.p012ReviewBot.issueDepartureCaptured,
      unloadedMovement:window.p012ReviewBot.unloadedMovementCaptured,
      input:window.p012ReviewBot.savedReloadInput,result:window.p012ReviewBot.savedReloadResult}));
    await fs.writeFile(path.join(outputDir,"Data_P012SavedInfiniteAmmo.json"),JSON.stringify(ammoEvidence,null,2));
    Check(ammoEvidence.saved?.infiniteAmmo&&ammoEvidence.rifle&&ammoEvidence.issued&&ammoEvidence.unloadedMovement,
      "持久无限弹开启仍实际经历空枪0/0、领弹0/15及未装弹出发");
    Check(ammoEvidence.input?.ammo===0&&ammoEvidence.input?.clips===3&&ammoEvidence.result?.ammo>0
      &&ammoEvidence.result.at>=ammoEvidence.input.at,"只有真实R之后才装弹；调试补充储备不冒充正常弹药消耗",JSON.stringify(ammoEvidence));
  }
  if(trainReview){
    const families=traffic.views.flatMap(view=>view.actors.filter(actor=>actor.role==="civilian"));
    const people=new Map(families.map(actor=>[actor.id,actor]));
    const children=[...people.values()].filter(actor=>["childBoy","childGirl"].includes(actor.variant));
    Check(people.size===13&&children.length===2,"实际疏散演员11成人加2儿童，不以配置人数代替实例");
    Check(children.every(actor=>actor.kind==="civilian"&&actor.unarmed&&actor.height>1.05&&actor.height<1.2),"实际儿童kind、身高与无枪属性正确");
    const familyViews=traffic.views.flatMap(view=>view.actors.filter(actor=>actor.familyId).map(actor=>({view,actor})));
    Check(new Set(familyViews.map(({actor})=>actor.familyId)).size===4,"四个家庭身份进入真实运行取证");
    Check(familyViews.some(({view,actor})=>view.actors.some(other=>other.id!==actor.id&&other.familyId===actor.familyId
      &&Math.abs(other.position[0]-actor.position[0])>.55&&Math.hypot(other.position[0]-actor.position[0],other.position[2]-actor.position[2])<3)),"宽处家庭实际横向展开而非永远单列");
    const moving=familyViews.filter(({actor})=>Math.hypot(actor.speedX,actor.speedZ)>.3).map(({actor})=>Math.hypot(actor.speedX,actor.speedZ));
    Check(moving.length>10&&Math.max(...moving)-Math.min(...moving)>.15,"实际家庭行走速度有差异而非统一速度");
    for(const child of children){
      const distances=familyViews.filter(({actor})=>actor.id===child.id).map(({view,actor})=>{
        const guardian=view.actors.find(other=>other.side===1&&other.slot===actor.guardianSlot);
        return guardian?Math.hypot(guardian.position[0]-actor.position[0],guardian.position[2]-actor.position[2]):Infinity;
      });
      Check(distances.length>0&&distances.every(distance=>distance<8),"儿童持续跟随真实守护者，不丢在身后",JSON.stringify({id:child.id,max:Math.max(...distances)}));
    }
  }
  const issue=await page.evaluate(()=>({trace:window.p012OpeningIssueTrace,callbacks:window.p012EquipmentCallbacks}));
  const trains=await page.evaluate(()=>({trace:window.p012TrainTrace,captures:window.p012TrainCaptures}));
  await fs.writeFile(path.join(outputDir,"Data_P012TrainColumn.json"),JSON.stringify(trains,null,2));
  const trainRows=trains.trace.flatMap(sample=>sample.trainColumn||[]);
  const extras=new Set(trainRows.filter(entry=>entry.extra).map(entry=>entry.actorId));
  if(extras.size){
    Check(extras.size===34,"额外下车军人明确独立统计34人，未隐藏原始人口");
    Check(trains.trace.every(sample=>sample.rawActors.filter(actor=>extras.has(actor.id)).every(actor=>actor.shots===0
      &&!['fire','charge','bayonet','melee'].includes(String(actor.state).toLowerCase()))),"34名额外军人全程没有射击或进入战斗状态");
  }
  if(trainReview){
    const ids=[...new Set(trainRows.map(entry=>entry.actorId))];
    Check(ids.length===40&&new Set(trainRows.filter(entry=>entry.original).map(entry=>entry.actorId)).size===6,"三车40人含原6名，不是额外再造40人");
    for(const [carIndex,count] of [[0,8],[1,24],[2,8]]){
      const carIds=ids.filter(id=>trainRows.some(entry=>entry.actorId===id&&entry.carIndex===carIndex));
      Check(carIds.length===count,`车${carIndex}实际演员数${count}`);
      for(const id of carIds){
        const rows=trainRows.filter(entry=>entry.actorId===id),first=rows[0];
        Check(first.position.x<-63.6&&Math.abs(first.position.y-P012_STATION_HEIGHTS.floorTop)<.12,`演员${id}实际从车内开始`);
        Check(rows.some(entry=>entry.exitDone&&entry.position.x>-60.5&&Math.abs(entry.position.y-P012_STATION_HEIGHTS.platformTop)<.15),`演员${id}真正下到站台而非只spawn`);
        Check(rows.some(entry=>entry.weaponIssued&&entry.ammoIssued&&entry.weaponIssueCount===1&&entry.ammoIssueCount===1),`演员${id}枪弹各领取一次`);
        const callbacks=issue.callbacks.filter(entry=>entry.id===id&&['weapon','ammo'].includes(entry.stage));
        Check(callbacks.length===2&&callbacks[0].stage==='weapon'&&callbacks[1].stage==='ammo',`演员${id}真实发放回调先枪后弹各一次`);
      }
    }
    Check([0,1,2].every(index=>trains.captures.includes(`Car${index}Exited`)),"三车下车完成事件各有真实玩家视角截图");
  }
  await fs.writeFile(path.join(outputDir,"Data_P012OpeningIssue.json"),JSON.stringify(issue,null,2));
  if(openingCausalityReview){
    Check(issue.callbacks.length>0&&issue.callbacks.every((row,index,all)=>
      all.findIndex(other=>other.id===row.id&&other.stage===row.stage)===index),
      "同批军人真实领取回调每人每类仅一次",JSON.stringify(issue.callbacks));
  }
  await fs.writeFile(path.join(outputDir, "Data_P012TrafficViews.json"), JSON.stringify(traffic, null, 2));
  if(!airRouteFixture)Check(traffic.population.armed <= 12 && traffic.population.unarmed <= 15,
    "原有战斗/群众预算独立统计；另列训练队、儿童、坐姿百姓及新增5名村路作业人员，全部计入原始人数", JSON.stringify(traffic.population));
  Check(errors.length === 0, "浏览器没有脚本或控制台错误", errors.join(" | "));
  console.log(`P012 screenshots: ${outputDir}`);
  if (pacingChecks.length) {
    await fs.writeFile(path.join(outputDir, "Data_P012PacingChecks.json"), JSON.stringify(pacingChecks, null, 2));
    for (const check of pacingChecks) Check(check.passed, check.label, check.detail);
  }
  runContext.assertionOutcome = "passed";
  console.log(process.argv.includes("--campaign")&&!process.argv.includes("--through-road") ? "FirstLevelP012BrowserTest campaign PASS" : "FirstLevelP012BrowserTest partial PASS (not a full campaign playthrough)");
} catch (error) {
  runContext.assertionOutcome = "failed";
  runContext.failure = String(error);
  const guidanceHud=await page.evaluate(()=>window.p012GuidanceHudTrace||[]).catch(()=>[]);
  await fs.writeFile(path.join(outputDir,"Data_P012GuidanceHud.json"),JSON.stringify(guidanceHud,null,2));
  const briefing=await page.evaluate(()=>({captured:window.p012ReviewBot?.briefingCaptured||[],inspection:window.p012ReviewBot?.inspectionTrace||[],incomplete:true})).catch(()=>null);
  await fs.writeFile(path.join(outputDir,"Data_P012BriefingInspection.json"),JSON.stringify(briefing,null,2));
  const trains=await page.evaluate(()=>({trace:window.p012TrainTrace||[],captures:window.p012TrainCaptures||[]})).catch(()=>null);
  await fs.writeFile(path.join(outputDir,"Data_P012TrainColumn.json"),JSON.stringify(trains,null,2));
  if(stationReview){
    const station=await page.evaluate(()=>({samples:window.p012StationTrace||[],views:window.p012StationViews||[],error:"incomplete station review; inspect failure trace"})).catch(()=>null);
    await fs.writeFile(path.join(outputDir,"Data_P012StationDescent.json"),JSON.stringify(station,null,2));
  }
  await page.evaluate(() => window.Tengxian?.StepFrames(1)).catch(() => {});
  await page.screenshot({ path: path.join(outputDir, "Scene_P012Failure.png") }).catch(() => {});
  const failureState = await page.evaluate(() => {
    const game = window.Tengxian;
    return { flow: game?.Debug.P012(), scene: game?.Debug.P012Scene(),
      player: game?.player.position.toArray(), health: game?.player.health,
      movement: game ? {velocity:game.player.velocity.toArray(),stance:game.player.stance,
        grounded:game.player.grounded,wounds:game.player.wounds,legPenalty:game.player.LegPenalty(),
        carrySpeedScale:game.player.carrySpeedScale,radius:game.player.body?.radius,
        hitCount:game.player.body?.hitCount,bodyPosition:game.player.body?.position.toArray()} : null,
      trace: window.p012CombatReview?.trace, diveTrace: window.p012CombatReview?.diveTrace,
      rewindCount: window.p012CombatReview?.rewindCount,
      damageTrace: window.p012DamageTrace || [],
      trafficViews:window.p012TrafficViews||[],population:window.p012PopulationMax,
      openingIssue:{trace:window.p012OpeningIssueTrace||[],callbacks:window.p012EquipmentCallbacks||[]},
      interact: game?.Debug.Interact(), strafe: game?.Debug.Strafe.State(),
      story: { fired: game?.story.fired, signals: [...(game?.story.signals || [])],
        immediate: game?.story.p012Immediate, cueLog: game?.story.p012CueLog } };
  }).catch(() => null);
  await fs.writeFile(path.join(outputDir, "Data_P012FailureTrace.json"),
    JSON.stringify({ error: String(error), browserErrors:errors, state: failureState }, null, 2));
  console.error("P012 failure", {beat:failureState?.flow?.beat,elapsed:failureState?.flow?.elapsed,
    guide:failureState?.scene?.guidePosition,column:failureState?.scene?.columnPosition,
    trace:path.join(outputDir,"Data_P012FailureTrace.json")});
  throw error;
} finally {
  runContext.finishedAt = new Date().toISOString();
  await fs.writeFile(runContextPath, JSON.stringify(runContext, null, 2));
  await browser.close();
  server.close();
}
