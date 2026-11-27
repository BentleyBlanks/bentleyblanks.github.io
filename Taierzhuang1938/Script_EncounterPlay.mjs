import * as THREE from "three";
import { EncounterPlayPlan, EncounterCanPlay, EncounterFirstPlayable, EncounterActorSpec, EncounterPlayerYaw, EncounterPuppetYaw, EncounterInitialActorYaw, EncounterOrderYaw, EncounterSceneSignals, ResolveEncounterStageStart, ResolveEncounterMissionArea, ENCOUNTER_PLAY_CONFIG as CONFIG } from "./Script_EncounterPlayPlan.mjs";
export { ResolveEncounterStageStart };
import { MissionAreaGuard } from "./Script_MissionAreaGuard.mjs";
import { MISSION_AREA_GUARD } from "./Data_Tuning_MissionArea.mjs";
import { CompileEncounterVariant } from "./Script_EncounterVariants.mjs";
import { FIRST_LEVEL_CAMPAIGN_VARIANT_ID, FIRST_LEVEL_BRIDGE_DEMO_TIMELINE_URL, FIRST_LEVEL_ENDING_TIMELINE_URL } from "./Data_FirstLevelCampaign.mjs";
import { FirstLevelOpeningTimeline } from "./Script_FirstLevelOpeningTimeline.mjs";
import { TimelineManager } from "./Script_TimelineDirector.mjs";
import { VillageStealthRules, VillageStealthAt, StageVillageCompanions } from "./Scenes/FirstLevelEncounter/Script_LevelFlowVillage.mjs";
import { SampleBeatRoute } from "./Scenes/FirstLevelEncounter/Script_LevelFlowGeometry.mjs";
import { VillageStealthPlay } from "./Script_VillageStealthPlay.mjs";
import { GroupPath } from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import { BlockoutPuppets } from "./Script_EditorBlockoutPuppets.mjs";
import { SpeakingCastOptions } from "./Script_FirstLevelSpeakingCast.mjs";
import { EncounterPlayView } from "./Script_EncounterPlayView.mjs";
import { EncounterPlayDialogue, EncounterDialogueLines } from "./Script_EncounterPlayDialogue.mjs";
import { EncounterTankRuntime } from "./Script_EncounterTankRuntime.mjs";
import { EncounterArtilleryRuntime } from "./Script_EncounterArtilleryRuntime.mjs";
import { LoadToolsVolume, ToolsVolumeLevel } from "./Script_EditorVolume.mjs";
import { ENCOUNTER_PLAY_STARTUP } from "./Data_Tuning_EncounterPlayStartup.mjs";
import { XBOT_CAST_CHARACTERS, XBOT_FACTION_CHARACTERS } from "./Data_XBotCharacters.mjs";
import { PrepareWoundMaterials } from "./Script_CharacterWounds.mjs";
import { AddGoreWarmProxies } from "./Script_CharacterGore.mjs";
import { DeferredMaterialDispose } from "./Script_DeferredMaterialDispose.mjs";
import { CHARACTER_RANDOM_VARIANTS_BY_KIND } from "./Data_CharacterSelection.mjs";
import { XBOT_DEATHS, XBOT_DEATH_FALLS, XBOT_NATIVE, XBOT_LOCOMOTION_4WAY, XBOT_TURN_IN_PLACE } from "./Data_BlockoutXBotClips.mjs";
import { PreloadDeathLibrary } from "./Script_HitReactionLayer.mjs";
import { LoadEncounterCast } from "./Script_EncounterPlaySplit.mjs";
import { SubmitEncounterPrograms, SubmitEncounterActorPrograms } from "./Script_EncounterShaderWarmup.mjs";
import { T } from "./Script_Text.mjs";
import { DeathTime } from "./Script_PlayerDeath.mjs";
import { PLAYER_DEATH } from "./Data_Tuning_PlayerDeath.mjs";
import {
  ResolveEncounterGroupSplineConfig,
  ResolveScriptedSquadConfig,
  BuildLiveSquadWaypoints,
  CreateLiveSquadController,
} from "./Script_FirstLevelSquadSpline.mjs";

const PAYLOAD_KEY="tengxian1938_encounter_play_session_v1";
function NextTask() {
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};
    channel.port2.postMessage(0);
  });
}
// Background or occluded tabs stop firing rAF; match Script_Main.NextFrame so Play loading never deadlocks when hidden.
function PaintFrame() {
  if(typeof document==="undefined"||document.hidden||typeof requestAnimationFrame!=="function")return NextTask();
  return new Promise(resolve=>{
    let frame=0;
    const finish=()=>{
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange",finish);
      resolve();
    };
    frame=requestAnimationFrame(finish);
    document.addEventListener("visibilitychange",finish,{once:true});
  });
}

function CreateSingleViewportStub(host) {
  return {
    count:1, focused:false, canvas:null, camera:host.camera,
    SetLayout(){},
    Size(){return {width:window.innerWidth,height:window.innerHeight};},
    Update(){},
    Render(){},
    State(){return {count:1,mode:"player",target:"player"};},
    Dispose(){},
  };
}

// All instances of a cast member share the loaded kit. Resize its source once,
// before spawning anyone, including maps used by more than one material slot.
async function PrepareCastTextures(kits,onProgress) {
  const sources=new Set(),limit=ENCOUNTER_PLAY_STARTUP.castTextureMaxSize;
  for(const kit of kits.values())kit.source.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of [object.material].flat())for(const texture of Object.values(material)) {
      if(!texture?.isTexture)continue;
      const image=texture.source.data;
      if(image instanceof HTMLImageElement || (typeof ImageBitmap!=="undefined" && image instanceof ImageBitmap)) sources.add(texture.source);
    }
  });
  const oversized=[...sources].filter(source=>Math.max(source.data.width,source.data.height)>limit);
  for(let index=0;index<oversized.length;index++) {
    const source=oversized[index],image=source.data,longest=Math.max(image.width,image.height);
    onProgress?.(index+1,oversized.length);
    const width=Math.max(1,Math.round(image.width*limit/longest));
    const height=Math.max(1,Math.round(image.height*limit/longest));
    if(typeof createImageBitmap==="function") {
      source.data=await createImageBitmap(image,{resizeWidth:width,resizeHeight:height,resizeQuality:"high",
        premultiplyAlpha:"none",colorSpaceConversion:"none"});
    } else {
      const canvas=document.createElement("canvas");
      canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d");
      context.imageSmoothingQuality="high";context.drawImage(image,0,0,width,height);
      source.data=canvas;
    }
    source.needsUpdate=true;
  }
}

export class EncounterPlay {
  constructor(host, options = {}) {
    this.host=host;this.hostId=crypto.randomUUID();this.mode=options.mode==="campaign"?"campaign":"editor";
    this.isCampaign=this.mode==="campaign";
    this.onComplete=options.onComplete||null;
    this.onFail=options.onFail||null;
    this.entries=new Map();this.failed=false;this.ready=false;this.disposed=false;this.active=true;this.paused=false;this.starting=false;this.initialized=false;
    this.completedHandled=false;
    // These terrain tiles are already individual spatial batches. Copying the
    // entire 1.9 km field into two more buffers competes with combat draws for
    // resident memory. Both passes can draw the same indexed tiles as color.
    for(const mesh of host.battlefield.meshes)if(mesh.userData.deformableTerrain) {
      mesh.userData.noPrepassBatch=true;
      mesh.userData.noShadowBatch=true;
    }
    this.orderClock=0;this.lastBeat=null;this.music=null;this.lastStateSent=0;this.smoke=new Map();this.pendingActions=new Map();this.retiredMaterials=new DeferredMaterialDispose();this.warmedSignatures=new Set();
    let payload=null;
    if(!this.isCampaign){
      try {payload=JSON.parse(sessionStorage.getItem(PAYLOAD_KEY)||"null");}catch{}
    }
    const search=new URLSearchParams(globalThis.location?.search||"");
    const urlVariant=search.get("variant");
    const resolvedVariantId=this.isCampaign
      ?(options.variantId||urlVariant||FIRST_LEVEL_CAMPAIGN_VARIANT_ID)
      :(payload?.variantId||urlVariant||undefined);
    this.variant=CompileEncounterVariant(resolvedVariantId);
    const skipOpening=!!(options.skipOpening||search.get("skipOpening")==="1");
    const startPlan=this.isCampaign
      ?ResolveEncounterStageStart(this.variant,options.startStage,{skipOpening})
      :{time:payload?.time||0,opening:false};
    this.pendingOpening=!!(this.isCampaign&&startPlan.opening);
    this._openingActive=false;
    this.endingPlaying=false;
    this.timelineSignals=new Map();
    this.combatStarted=!this.pendingOpening;
    this.plan=new EncounterPlayPlan(this.isCampaign?this.variant.defaultDocument:(payload?.document||this.variant.defaultDocument),startPlan.time,this.variant);
    this.stealth=this.variant.stealthPlan?new VillageStealthPlay(host,new VillageStealthRules(this.variant.timeline)):null;
    this.areaGuard=new MissionAreaGuard(MISSION_AREA_GUARD);
    this.areaFailure=null;
    this.noFireShots=0;this.noFireGrenades=0;this.noFireFailure=null;
    this.checkpointInventory=payload?.checkpointInventory||null;
    this.checkpointTime=null;
    this.templeEnteredAt=this.stealth&&this.plan.beat.id==="09b"?0:null;
    this.token=payload?.token||(this.isCampaign?"campaign":"standalone");
    const groundAt=(x,z)=>this.variant.surfaceAt([x,z],this.sceneSignals||[])??host.battlefield.GroundHeight(x,z);
    this.groundAt=groundAt;
    this.puppets=new BlockoutPuppets({scene:host.scene,actorFactory:host.actorFactory,library:host.library,loadCast:LoadEncounterCast,
      groundAt,formalOnly:true,asyncBlood:true,riggedPoseOnly:true,
      characterKeys:[...new Set([...Object.values(this.plan.config.casts).map(id=>XBOT_CAST_CHARACTERS[id]).filter(Boolean),...Object.values(XBOT_FACTION_CHARACTERS).flat()])]});
    this.tanks=new EncounterTankRuntime(host,this.puppets,{groundAt});
    this.artillery=new EncounterArtilleryRuntime(host,this.variant,{groundAt});
    this.blastHookInstalled=false;this.previousOnBlast=null;this.blastHandler=null;
    this.InstallBlastHook();
    this.view=this.isCampaign?CreateSingleViewportStub(host):new EncounterPlayView(host);
    this.puppets.xbot.view={camera:host.camera,renderer:host.renderer,post:host.post,lightRig:host.ctx.lights};
    this.timelineResolver={
      puppets:this.puppets,ai:host.ai,scene:host.scene,library:host.library,battlefield:host.battlefield,groundAt,
      getPlayer:()=>host.player,
      getCamera:()=>host.camera,
      findLiveSoldier:(match,slot)=>{
        const direct=this.entries.get(match?.id||slot);
        if(direct?.soldier?.alive)return direct.soldier;
        if(match?.castId){
          for(const entry of this.entries.values()){
            if(entry.soldier?.alive&&(entry.spec?.castId===match.castId||entry.soldier.castId===match.castId))return entry.soldier;
          }
        }
        return null;
      },
      findPuppetId:(match,slot)=>{
        const id=match?.id||slot;
        if(this.puppets.puppets.has(id))return id;
        if(match?.castId){
          for(const [pid,p] of this.puppets.puppets)if(p.unit?.castId===match.castId)return pid;
        }
        return null;
      },
    };
    this.timelines=new TimelineManager({
      host,resolver:this.timelineResolver,groundAt,env:host.ctx.env,
      encounter:{
        setTimelineSignals:map=>{this.timelineSignals=new Map(map);this.SyncTimelineScenarioSignals();},
        setFact:(id,val)=>{if(val)this.plan.facts.add(id);else this.plan.facts.delete(id);},
        advanceBeat:()=>{},
        complete:()=>this.FinishCampaign(),
      },
      onStateChange:state=>{
        if(state.hidesHud){
          this.speech?.Clear();
          if(this.isCampaign&&this.host.ctx.hudRoot)this.host.ctx.hudRoot.style.display="none";
        }else if(!this._openingActive&&!this.host.state.menu){
          if(this.isCampaign&&this.host.ctx.hudRoot)this.host.ctx.hudRoot.style.display="";
          this.environmentHour=null;
        }
        if(this.host.viewmodel){
          if(state.hidesViewmodel)this.host.viewmodel.root.visible=false;
          else if(!this._openingActive&&this.combatStarted)this.host.viewmodel.root.visible=true;
        }
      },
    });
    this.opening=this.isCampaign
      ?new FirstLevelOpeningTimeline({host,puppets:this.puppets,groundAt,resolver:this.timelineResolver,
          prefabs:this.timelines.prefabs,actions:this.timelines.actions,onComplete:()=>this.OnOpeningComplete()})
      :null;
    this.BuildUi();
    this.api={State:()=>this.State(),MissionState:()=>this.MissionState(),Stages:()=>this.Stages(),
      SetLayout:n=>this.view.SetLayout(n),Interact:()=>this.Interact(),
      Actors:()=>this.Actors(),Presentation:()=>this.Presentation(),Tanks:()=>this.tanks?.State()||[],Retry:opts=>this.Retry(opts),
      Begin:p=>this.Begin(p),JumpToStage:v=>this.JumpToStage(v),SkipOpening:()=>this.SkipOpening(),
      Timelines:()=>this.TimelineApi(),
      Pause:on=>this.Pause(on),Suspend:()=>this.Suspend(),Stop:()=>this.RequestStop(),Dispose:()=>this.Dispose(),Ready:()=>this.readyPromise};
    this.readyPromise=this.Load().catch(error=>{this.error=String(error.stack||error);console.error(error);this.Send("error",{message:String(error.message||error)});});
  }
  get openingActive(){return this._openingActive||!!this.timelines?.IsBlockingInput();}
  set openingActive(value){this._openingActive=!!value;}
  SyncTimelineScenarioSignals() {
    const active=new Set(this.sceneSignals||["Stage0105Done"]);
    for(const [id,on] of this.timelineSignals){if(on)active.add(id);else active.delete(id);}
    this.sceneSignals=[...active];
    if(!this.host.battlefield?.RestoreScenario)return;
    const changed=this.host.battlefield.RestoreScenario({signalled:id=>active.has(id)});
    if(changed)this.host.ctx.navGrid?.Refresh?.(this.host.battlefield,{spread:true});
  }
  TimelineApi() {
    return {
      State:()=>({
        opening:this.opening?.State()||null,
        manager:this.timelines.State(),
      }),
      Play:(docOrUrl,opts)=>this.timelines.Play(docOrUrl,opts),
      Seek:(id,t)=>{
        if(id==="FirstLevelOpeningCampaign"&&this.opening)return this.opening.Seek(t);
        return this.timelines.Get(id)?.Seek(t)||null;
      },
      Step:(id,frames)=>this.timelines.Get(id)?.Step(frames)||null,
      Pause:(id,on=true)=>{
        if(id==="FirstLevelOpeningCampaign"&&this.opening){this.opening.SetPaused(on);return true;}
        if(id)return this.timelines.Get(id)?.SetPaused(on)||false;
        this.timelines.SetPaused(on);return true;
      },
      Skip:(id)=>{
        if(this._openingActive&&(!id||id==="FirstLevelOpeningCampaign"))return this.SkipOpening();
        return this.timelines.Skip(id||null);
      },
      Stop:(id)=>{
        if(this._openingActive&&(!id||id==="FirstLevelOpeningCampaign")){this.opening.Stop();this._openingActive=false;return true;}
        return this.timelines.Stop(id||null);
      },
      SignalGate:(gateId)=>this.timelines.SignalGate(gateId),
      RegisterAction:(id,fn,opts)=>this.timelines.RegisterAction(id,fn,opts),
      RegisterPrefab:(id,fn)=>this.timelines.RegisterPrefab(id,fn),
    };
  }
  FinishCampaign() {
    if(this.completedHandled||this.disposed)return;
    this.completedHandled=true;
    this.endingPlaying=false;
    this.host.audio.Music(null,{fadeOut:1.5});
    this.speech.Clear();
    this.RenderHud();
    if(this.isCampaign&&this.host.ctx.hudRoot&&!this.host.state.menu)this.host.ctx.hudRoot.style.display="";
    if(this.host.viewmodel)this.host.viewmodel.root.visible=true;
    this.onComplete?.(this.MissionState());
  }
  PlayEndingTimeline() {
    if(this.endingPlaying||this.completedHandled||this.disposed)return;
    this.endingPlaying=true;
    this.speech.Clear();
    if(this.isCampaign&&this.host.ctx.hudRoot)this.host.ctx.hudRoot.style.display="none";
    this.timelines.Play(FIRST_LEVEL_ENDING_TIMELINE_URL,{
      key:"FirstLevelEndingNightMarch",
      onComplete:()=>this.FinishCampaign(),
    }).catch(error=>{
      console.warn("[EncounterPlay] Ending timeline unavailable; completing campaign:",error);
      this.FinishCampaign();
    });
  }
  InstallBlastHook() {
    const ch=this.host.combat?.host;
    if(!ch||this.blastHookInstalled)return;
    this.previousOnBlast=ch.onBlast||null;
    this.blastHandler=event=>{this.previousOnBlast?.(event);if(this.active&&this.combatStarted&&!this.failed)this.tanks?.OnBlast(event);};
    ch.onBlast=this.blastHandler;
    this.blastHookInstalled=true;
  }
  RestoreBlastHook() {
    const ch=this.host.combat?.host;
    if(!ch||!this.blastHookInstalled)return;
    if(ch.onBlast===this.blastHandler)ch.onBlast=this.previousOnBlast;
    this.blastHookInstalled=false;this.previousOnBlast=null;this.blastHandler=null;
  }
  OnTankHit(tankId,point,from) {
    if(!this.active||!this.combatStarted||this.failed)return null;
    return this.tanks?.OnBulletHit(tankId,point,from)??null;
  }
  BuildUi() {
    document.body.classList.add(this.isCampaign?"encounterCampaign":"encounterGame");
    this.style=document.createElement("link");this.style.rel="stylesheet";this.style.href=new URL("./Style_EncounterPlay.css?v=20261126HudActions",import.meta.url).href;document.head.append(this.style);
    this.speech=new EncounterPlayDialogue(this.host,this.view,id=>{
      const position=this.Position(id),soldier=this.entries.get(id)?.soldier;
      return position?{position,pose:soldier?.stance}:null;
    });
    if(!this.isCampaign){
      this.onMessage=e=>{
        if(e.source!==window.parent||e.origin!==location.origin||e.data?.token!==this.token)return;
        if(e.data.type==="encounter-play-layout")this.view.SetLayout(e.data.count);
        if(e.data.type==="encounter-play-stop")this.Dispose();
      };
      window.addEventListener("message",this.onMessage);
    }
    this.failureCard=document.createElement("div");this.failureCard.className="encounterFailure";
    this.failureCard.setAttribute("role","alert");this.failureCard.hidden=true;
    this.failureCard.append(document.createElement("strong"),document.createElement("p"));
    document.body.append(this.failureCard);
  }
  // A failed or finished run freezes the world, but the collapse itself must
  // finish first; otherwise death looks like a hung frame with no feedback.
  DeathSettled(){return this.host.player.Alive||DeathTime(this.host.player)>=PLAYER_DEATH.durationS+PLAYER_DEATH.menuFadeS;}
  ScaleDt(dt){
    if(!this.active||!this.ready||this.paused)return 0;
    if(this.failed)return this.DeathSettled()?0:dt;
    return this.plan.completed&&!this.endingPlaying&&!this.timelines?.HasActive()?0:dt;
  }
  RenderFailure(status,hint){
    if(this.isCampaign){if(!this.failureCard.hidden)this.failureCard.hidden=true;return;}
    const show=(this.failed||this.plan.completed)&&this.ready&&!this.starting&&this.DeathSettled();
    if(show){
      const [title,text]=this.failureCard.children;
      if(title.textContent!==status)title.textContent=status;
      if(text.textContent!==hint)text.textContent=hint;
      this.failureCard.classList.toggle("encounterFailureDone",!this.failed);
    }
    if(this.failureCard.hidden===show)this.failureCard.hidden=!show;
  }
  ReportStep(label,progress=0) {
    (this.onWarmStep||this.host.SetBootStep)?.(label,progress);
  }
  async Load() {
    const phase=this.host.ctx.PHASE_TABLE[this.host.state.phaseIndex];
    if(phase.blockout?.sceneError)throw new Error(phase.blockout.sceneError);
    // Launch independent driver work while character kits are still loading.
    if(!this.initialized) {
      this.ReportStep(T("boot.step.encounterPostShaders"),0.02);
      await PaintFrame();
      if(this.disposed||!this.active)return;
      this.passProgramsSubmitted=SubmitEncounterPrograms(this.host);
    } else this.passProgramsSubmitted=0;
    let sfxWarm=null;
    if(this.host.audio?.enabled) {
      if(!this.host.audio.ctx)this.host.audio.CreateContext?.();
      if(this.host.audio.ctx&&!this.host.audio.sfxReady&&!this.host.audio.sfxLoading) {
        this.host.audio.sfxLoading=true;
        sfxWarm=Promise.resolve(this.host.audio.LoadSfxPack?.()).catch(()=>{}).finally(()=>{this.host.audio.sfxLoading=false;});
      }
      this.host.audio.LoadPacks?.();
    }
    this.ReportStep(T("boot.step.encounterCast"),0.06);
    const combatClipFiles=[...new Set([
      ...Object.values(XBOT_DEATHS).map(entry=>entry?.file),
      ...XBOT_DEATH_FALLS.map(entry=>entry.file),
      ...Object.values(XBOT_NATIVE).map(entry=>entry?.file),
      ...Object.values(XBOT_TURN_IN_PLACE).map(entry=>entry?.file),
      ...Object.values(XBOT_LOCOMOTION_4WAY).flatMap(group=>Object.values(group||{}).map(entry=>entry?.file)),
    ].filter(Boolean))];
    const openingLoad=this.opening&&this.pendingOpening
      ?this.opening.Load().catch(error=>{console.warn("[EncounterPlay] Opening timeline unavailable, falling back to 02g",error);this.pendingOpening=false;this.combatStarted=true;})
      :null;
    const timelinePreload=this.timelines.PreloadDependencies([FIRST_LEVEL_BRIDGE_DEMO_TIMELINE_URL,FIRST_LEVEL_ENDING_TIMELINE_URL]);
    await Promise.all([this.puppets.xbot.Load({preloadClips:combatClipFiles}),PreloadDeathLibrary(),sfxWarm,openingLoad,timelinePreload,this.puppets.LoadTankette()]);
    if(this.disposed)return;
    if(!this.puppets.xbot.ready)throw new Error("Character library could not load");
    this.castTexturesReady??=PrepareCastTextures(this.puppets.xbot.kits,(done,total)=>
      this.ReportStep(T("boot.step.encounterTextures",{done,total}),0.06+(done/total)*0.08));
    await this.castTexturesReady;
    this.ReportStep(T("boot.step.encounterDeaths"),0.16);
    const clipWarmups=await Promise.allSettled(combatClipFiles.map(file=>this.puppets.xbot.Clip(file)));
    for(const result of clipWarmups)if(result.status==="rejected")console.warn("[EncounterPlay] Combat/death clip warmup failed; retaining fallback poses",result.reason);
    for(const key of ["fireStand","fireCrouch","fireProne"]) {
      const file=XBOT_NATIVE[key]?.file;
      if(file)this.puppets.xbot.AdditiveFireTracks?.(file);
    }
    if(this.disposed||!this.active)return;
    const missingKeys=(this.puppets.xbot.characterKeys||[]).filter(key=>!this.puppets.xbot.kits.has(key));
    if(missingKeys.length){
      if(this.isCampaign)console.warn("[EncounterPlay] Character model missing; retaining fallback rig:",missingKeys.join(", "));
      else throw new Error("正式人物模型加载失败："+missingKeys[0]);
    }
    this.ReportStep(T("boot.step.encounterActors"),0.2);
    await PaintFrame();
    if(this.disposed||!this.active)return;
    this.PreparePlayerLoadout();
    this.host.hud.ClearStaging?.();
    if(this.previousMissionCoverRules===undefined)this.previousMissionCoverRules=this.host.ai.missionCoverRules;
    if(this.previousMissionReactions===undefined)this.previousMissionReactions=this.host.ai.missionReactions;
    this.host.ai.missionCoverRules=true;
    this.host.ai.missionReactions=true;
    if(!this.isCampaign)this.host.audio.SetToolsVolume?.(ToolsVolumeLevel(LoadToolsVolume(this.host.audio.masterVolume??1)));
    this.stealth?.Reset();
    this.noFireShots=this.host.state.playerShots;
    this.noFireGrenades=this.host.state.grenades+this.host.state.bundles;
    this.noFireFailure=null;
    this.areaGuard.Reset();this.areaFailure=null;this.host.hud.SetMissionArea?.(null);
    this.artillery?.Reset();
    if(this.pendingOpening&&this.opening?.loaded){
      this.combatStarted=false;
      const frame=this.variant.evaluate(this.plan.time,this.plan.document);
      this.SyncEnvironment(frame,true);
      await this.opening.Stage("01-1");
      this.initialized=true;this.ready=true;
      this.puppets.Settle(10,.05,this.host.camera.position);
      this.Send("ready");
      return;
    }
    this.combatStarted=true;
    const frame=this.variant.evaluate(this.plan.time,this.plan.document);
    const p=frame.actors.find(a=>a.id==="player");
    this.host.player.Spawn(...p.p,EncounterPlayerYaw(this.plan.beat));
    this.SyncEnvironment(frame,true);
    for(const actor of this.plan.initial)if(this.IsSoldier(actor))this.Spawn(actor,true);
    this.initialized=true;this.ready=true;this.preparingPuppets=true;this.Update(0);
    this.puppets.Settle(40,.05,this.host.player.position);this.preparingPuppets=false;this.SetPlayerPuppetVisible(false);
    this.Send("ready");
  }
  PreparePlayerLoadout() {
    const cfg=this.plan.config;
    if(this.host.Weapon()!==cfg.startWeapon)this.host.Pickup(cfg.startWeapon);
    this.host.state.clips=cfg.inventory.spareClips;
    if(this.host.state.mags.primary)this.host.state.mags.primary.clips=cfg.inventory.spareClips;
    this.host.state.grenades=cfg.inventory.grenades;this.host.state.bundles=cfg.inventory.bundles;
    this.RestoreCheckpointInventory();
    this.host.ctx.ApplyDebugOptions({reload:true});
  }
  OnStartRun() {
    if(!this.isCampaign||!this.ready||this.disposed)return;
    if(this.pendingOpening&&this.opening?.loaded){
      this.pendingOpening=false;
      this.openingActive=true;
      this.combatStarted=false;
      this.opening.Start("01-1");
    }
  }
  OnOpeningComplete() {
    if(this.disposed)return;
    this.openingActive=false;
    this.pendingOpening=false;
    this.ActivateCombat();
  }
  SkipOpening() {
    if(!this.openingActive&&!this.pendingOpening)return false;
    if(this.openingActive)return this.opening.Skip();
    this.pendingOpening=false;
    this.ActivateCombat();
    return true;
  }
  ActivateCombat() {
    if(this.disposed)return;
    this.combatStarted=true;
    this.completedHandled=false;
    this.failed=false;
    this.signalKey=null;
    this.hudKey=null;
    this.music=null;
    this.PreparePlayerLoadout();
    this.host.hud.ClearStaging?.();
    const frame=this.variant.evaluate(this.plan.time,this.plan.document);
    const p=frame.actors.find(a=>a.id==="player");
    this.host.player.Spawn(...p.p,EncounterPlayerYaw(this.plan.beat));
    this.SyncEnvironment(frame,true);
    this.host.ai.missionCoverRules=true;
    this.host.ai.missionReactions=true;
    this.noFireShots=this.host.state.playerShots;
    this.noFireGrenades=this.host.state.grenades+this.host.state.bundles;
    this.noFireFailure=null;
    this.areaGuard.Reset();this.areaFailure=null;this.host.hud.SetMissionArea?.(null);
    this.artillery?.Reset();
    for(const actor of this.plan.initial)if(this.IsSoldier(actor))this.Spawn(actor,true);
    if(this.isCampaign&&this.host.ctx.hudRoot&&!this.host.state.menu)this.host.ctx.hudRoot.style.display="";
    if(this.host.viewmodel)this.host.viewmodel.root.visible=true;
    this.preparingPuppets=true;this.Update(0);
    this.puppets.Settle(20,.05,this.host.player.position);this.preparingPuppets=false;this.SetPlayerPuppetVisible(false);
    this.SaveCheckpoint();
    this.host.post.NotifyCameraCut();this.view.post?.NotifyCameraCut();
    if(this.isCampaign&&this.host.state.running&&!this.host.state.menu)this.host.ctx.RequestPointerLock?.();
  }
  async Begin(payload) {
    if(this.disposed)throw new Error("Play host disposed");
    if(this.active||this.ready||this.entries.size||this.pendingActions.size||this.openingActive)this.Suspend();
    else this.view.SetLayout(1);
    this.starting=true;this.active=true;this.token=payload.token||(this.isCampaign?"campaign":"standalone");
    this.InstallBlastHook();
    const token=this.token;
    if(payload.variantId&&payload.variantId!==this.variant.id) {
      this.variant=CompileEncounterVariant(payload.variantId);
      this.stealth=this.variant.stealthPlan?new VillageStealthPlay(this.host,new VillageStealthRules(this.variant.timeline)):null;
      this.artillery?.SetVariant(this.variant);
    } else {
      this.artillery?.Reset();
    }
    this.pendingOpening=!!(this.isCampaign&&payload.opening);
    this.openingActive=false;
    this.combatStarted=!this.pendingOpening;
    this.completedHandled=false;
    this.plan=new EncounterPlayPlan(this.isCampaign?this.variant.defaultDocument:payload.document,payload.time,this.variant);
    this.templeEnteredAt=this.stealth&&this.plan.beat.id==="09b"?0:null;
    this.checkpointInventory=payload.checkpointInventory||null;this.checkpointTime=null;this.alarmAnnounced=false;
    this.failed=false;this.noFireFailure=null;this.areaFailure=null;this.areaGuard.Reset();this.host.hud.SetMissionArea?.(null);this.error=null;this.hudKey=null;this.signalKey=null;this.lastBeat=null;this.lastStateSent=0;this.orderClock=0;this.music=null;
    this.host.ctx.RespawnPlayer(true);
    this.host.state.deathTimer=0;this.host.state.playerShots=0;this.host.state.lastShot=null;
    this.host.hud.HideDeathCard?.();this.host.viewmodel.ResetDeath?.();
    this.readyPromise=this.Load();await this.readyPromise;
    if(!this.active||this.token!==token)return false;
    await this.Warmup(this.onWarmStep);
    if(!this.active||this.token!==token)return false;
    this.host.post.NotifyCameraCut();this.view.post?.NotifyCameraCut();
    this.starting=false;this.host.ctx.menu?.Close();this.host.state.menu=false;this.host.state.running=true;
    this.host.audio.SetPaused(false);this.host.audio.ctx?.resume().catch(()=>{});
    if(this.pendingOpening)this.OnStartRun();
    this.host.ctx.RenderScene(0);this.Send("state",{state:this.State()});return true;
  }
  async JumpToStage(stageOrBeat) {
    if(this.disposed)return null;
    const start=ResolveEncounterStageStart(this.variant,stageOrBeat,{skipOpening:false});
    await this.Begin({token:"campaign",variantId:this.variant.id,time:start.time,document:this.variant.defaultDocument,opening:start.opening});
    return this.MissionState();
  }
  SetPaused(on) {
    if(!this.active||!this.ready||this.starting)return false;
    this.paused=!!on;
    if(this._openingActive)this.opening?.SetPaused(this.paused);
    this.timelines?.SetPaused(this.paused);
    return this.paused;
  }
  Pause(on=!this.paused) {
    if(!this.active||!this.ready||this.starting)return false;
    this.paused=!!on;this.host.state.running=!this.paused;
    if(this._openingActive)this.opening?.SetPaused(this.paused);
    this.timelines?.SetPaused(this.paused);
    this.host.audio.SetPaused(this.paused);
    if(this.paused){this.host.ctx.ReleasePointerLock();this.host.audio.ctx?.suspend();}
    else{this.host.ctx.menu?.Close();this.host.state.menu=false;this.host.audio.ctx?.resume();}
    this.Send("state",{state:this.State()});return this.paused;
  }
  Suspend() {
    this.opening?.Stop();
    this.timelines?.Stop();
    this.timelineSignals.clear();
    this.endingPlaying=false;
    this.tanks?.Reset();
    this.artillery?.Reset();
    this.RestoreBlastHook();
    this.openingActive=false;this.pendingOpening=false;this.combatStarted=false;
    if(this.previousEnvironmentObserverMode!==undefined) this.host.ctx.env.observerMode=this.previousEnvironmentObserverMode;
    if(this.previousMissionCoverRules!==undefined) this.host.ai.missionCoverRules=this.previousMissionCoverRules;
    if(this.previousMissionReactions!==undefined) this.host.ai.missionReactions=this.previousMissionReactions;
    this.active=false;this.paused=false;this.ready=false;this.host.state.running=false;
    this.host.ctx.ReleasePointerLock();this.host.audio.ResetSession();this.host.audio.ctx?.suspend();
    this.retiredMaterials.Collect(()=>{
      this.host.ctx.gore?.ReleaseAll();this.host.ctx.meleeCombat?.Reset();
      this.host.combat.ClearProjectiles();this.host.interact.Clear();this.host.interact.ClearGroundWeapons();this.host.ctx.ClearLooseGuns();
      for(const entry of this.entries.values())this.host.ai.Remove(entry.soldier);
      this.entries.clear();this.host.ai.tactics.Reset();
      for(const id of this.smoke.values())this.host.vfx.RemoveSmokeSource(id);this.smoke.clear();this.pendingActions.clear();
      this.puppets.Clear();this.host.vfx.ClearParticles();this.host.battlefield.deformation?.Reset();
    });
    this.view.SetLayout(1);this.host.post.NotifyCameraCut();this.view.post?.NotifyCameraCut();
    this.speech.Clear();this.stealth?.Reset();this.areaGuard?.Reset();this.areaFailure=null;this.host.hud.SetMissionArea?.(null);this.noFireFailure=null;this.failureCard.hidden=true;
  }
  IsSoldier(a){return a.id!=="player"&&a.kind==="person"&&["friend","enemy"].includes(a.side);}
  SyncEnvironment(frame,snap=false) {
    const {env,envBridge}=this.host.ctx;
    if(!env?.active)return;
    const config=this.plan.config.environment;
    const night=Math.round((frame.nightBlend||0)*config.steps)/config.steps;
    const hour=frame.beat.id<config.duskBeat?config.dayHour:config.duskHour+(config.nightHour-config.duskHour)*night;
    if(snap||this.environmentHour!==hour) {env.SetHour(hour);this.environmentHour=hour;}
    if(snap) {
      this.previousEnvironmentObserverMode=env.observerMode;
      env.observerMode="player";
      envBridge.Apply(env.SnapAt(this.host.player.position),{force:true});
    }
  }
  async Warmup(onStep) {
    this.onWarmStep=onStep;
    await this.readyPromise;
    if(!this.ready)throw new Error(this.error||"Encounter assets not ready");
    await Promise.all([...this.puppets.puppets.values()].flatMap(p=>p.humans.map(h=>h.towel?.Ready?.()).filter(Boolean)));
    const {host}=this,start=performance.now(),wasWarming=host.state.warming;
    const signature=JSON.stringify([this.plan.startBeat.id,this.pendingOpening,host.ctx.graphics,host.viewmodel.weaponId,
      [...this.entries.values()].map(e=>[e.actor.id,e.soldier.actor?.characterRig?.modelId,e.skin?.kit?.key,e.spec.weapon]),
      this.Presentation().map(p=>[p.id,p.kind,p.humans])]);
    const retained=this.warmedSignatures.has(signature);
    let bloodDrops=0,prepassBatchPrimed=0,shadowBatchPrimed=0,actorProgramsSubmitted=0,firstBatch=null;
    const excluded=new Set([...this.entries.values()].flatMap(entry=>entry.skin?.hidden||[]));
    // Formal skins hide these native bodies on every synced frame. Newly attached
    // ones are still visible here, and drawing them only links unused skinned programs.
    for(const mesh of excluded)mesh.visible=false;
    const post=host.post;
    const dimensions=retained?null:[post.width,post.height,post.outputWidth,post.outputHeight];
    const hiddenHair=[];
    const prevVmVisible=host.viewmodel.root.visible;
    host.viewmodel.root.visible=true;
    const group=new THREE.Group();group.name="EncounterWarmExtras";
    AddGoreWarmProxies(group,[...this.entries.values()].map(e=>e.soldier.actor));
    const debris=host.viewmodel.CreateActionDebrisWarmProxy();
    debris.position.copy(host.player.EyePosition);
    for(const mesh of debris.children)mesh.frustumCulled=false;
    group.add(debris);
    const shadowBatch=host.ctx.shadowCasterBatch;
    const warmShadowBatch=!retained&&shadowBatch?.enabled&&host.renderer.shadowMap.enabled&&host.ctx.lights?.csm?.active;
    const shadowProxy=warmShadowBatch?shadowBatch.WarmProxy():null;
    const prevShadowBypass=shadowBatch?.bypass??false;
    if(shadowProxy) {
      shadowProxy.name="ShadowBatchBootWarmProxy";
      shadowProxy.position.set(host.player.position.x,host.player.position.y+1,host.player.position.z);
      shadowProxy.traverse(mesh=>{if(mesh.isMesh)mesh.frustumCulled=false;});
      group.add(shadowProxy);
      shadowBatch.bypass=true;
    }
    host.scene.add(group);host.state.warming=true;
    const options={submitBatch:ENCOUNTER_PLAY_STARTUP.shaderSubmitBatch,
      drawBatch:ENCOUNTER_PLAY_STARTUP.shaderDrawBatch,revealBatch:ENCOUNTER_PLAY_STARTUP.meshRevealBatch,excluded,overlapLink:true,
      onFirstDraw:(ms,programs)=>{firstBatch={ms,programs};}};
    try {
      if(dimensions){
        const height=Math.min(post.height,ENCOUNTER_PLAY_STARTUP.warmupHeight);
        const width=Math.max(1,Math.round(height*post.width/post.height));
        post.SetSize(width,height,Math.round(width*post.outputWidth/post.width),Math.round(height*post.outputHeight/post.height));
      }
      host.scene.traverse(mesh=>{if(mesh.userData.hairGroom&&!mesh.visible){hiddenHair.push(mesh);mesh.visible=true;}});
      if(!host.actorFactory?.characterAssets?.minimalRig)host.ai.PrepareCrowd(["nra","ija"]);
      PrepareWoundMaterials(host.scene);
      if(retained) {
        // These programs and action buffers already exist. A whole-scene
        // compile here also submits unused variants of the hidden actor rigs.
        host.ctx.RenderScene(0);
      } else {
        this.ReportStep(T("boot.step.encounterActorShaders"),0.24);
        await PaintFrame();
        actorProgramsSubmitted=SubmitEncounterActorPrograms(host);
        if(shadowProxy) host.ctx.lights.csm.ForceUpdate();
        await host.ctx.WarmupShaders(host.scene,onStep,null,options);
        host.viewmodel.DrawActionWarmup(()=>host.ctx.RenderScene(0));
      }
    } catch(error) {
      this.error=String(error.stack||error);this.ready=false;this.Send("error",{message:String(error.message||error)});throw error;
    } finally {
      if(shadowProxy) {
        shadowBatch.bypass=prevShadowBypass;
        shadowBatch.DisposeWarmProxy(shadowProxy);
        host.ctx.lights.csm.ForceUpdate();
      }
      host.viewmodel.root.visible=prevVmVisible;
      group.removeFromParent();
      for(const mesh of hiddenHair)mesh.visible=false;
      for(const child of group.children)if(child.isMesh&&child.name.startsWith("GoreWarm_Part_"))child.geometry.dispose();
      if(dimensions){
        const size=host.renderer.getDrawingBufferSize(new THREE.Vector2());
        post.SetSize(Math.round(size.x*dimensions[0]/dimensions[2]),Math.round(size.y*dimensions[1]/dimensions[3]),size.x,size.y);
        post.NotifyCameraCut();
      }
      host.state.warming=wasWarming;
    }
    await post.dofPass.Warmup();
    await host.vfx.particles.Ready();
    const blood=host.vfx.bloodEffects;
    const ready=host.state.ready;
    const warming=host.state.warming;
    const prevWarmVmVisible=host.viewmodel.root.visible;
    const DrawWarmFrame=(sync=false)=>{
      host.ctx.StepFrames(1,ENCOUNTER_PLAY_STARTUP.settleDt,true);
      if(sync) host.renderer.getContext().finish();
    };
    try{
      host.state.ready=true;host.state.warming=false;host.viewmodel.root.visible=true;
      this.ReportStep(T("boot.step.encounterWarmFrames",{done:1,total:ENCOUNTER_PLAY_STARTUP.settleFrames}),0.95);
      // Update the actual camera and blood distance-culling eye first.
      DrawWarmFrame(false);
      // Restart reconstructs actors and their batch membership even when the
      // programs are retained. Draw their actual passes before releasing input.
      shadowBatchPrimed=host.ctx.shadowCasterBatch?.Prime()||0;
      prepassBatchPrimed=host.ctx.prepassStaticBatch?.Prime()||0;
      blood.Update(0,host.vfx.time,host.camera);
      const direction=host.player.ViewDirection(new THREE.Vector3());
      const spot=host.player.EyePosition.clone().addScaledVector(direction,2);
      const existingDrops=blood.activeDrops.length;
      host.vfx.Blood(spot,direction,1);
      bloodDrops=blood.activeDrops.length-existingDrops;
      spot.y=host.battlefield.GroundHeight(spot.x,spot.z);
      blood.decals.Add(spot,new THREE.Vector3(0,1,0),0.1,{now:host.vfx.time});
      const weaponKind=host.viewmodel.weapon?.kind||"boltRifle";
      host.vfx.MuzzleFlash?.(spot,direction,{scale:0.25,player:true,kind:weaponKind});
      host.vfx.Impact?.(spot,new THREE.Vector3(0,1,0),"brick",{weaponKind});
      host.vfx.Impact?.(spot,new THREE.Vector3(0,1,0),"dirt",{weaponKind});
      host.vfx.Tracer?.(spot,spot.clone().addScaledVector(direction,6),{kind:"nra"});
      const prevAds=host.player.ads,prevWantAds=host.player.wantAds,prevFovT=host.ctx.adsFovT;
      try {
        host.player.ads=1;host.player.wantAds=true;host.ctx.adsFovT=1;
        DrawWarmFrame(false);
      } finally {
        host.player.ads=prevAds;host.player.wantAds=prevWantAds;host.ctx.adsFovT=prevFovT;
      }
      for(let i=1;i<ENCOUNTER_PLAY_STARTUP.settleFrames;i++){
        this.ReportStep(T("boot.step.encounterWarmFrames",{done:i+1,total:ENCOUNTER_PLAY_STARTUP.settleFrames}),0.95+((i+1)/ENCOUNTER_PLAY_STARTUP.settleFrames)*0.05);
        DrawWarmFrame(i===ENCOUNTER_PLAY_STARTUP.settleFrames-1);
      }
    }finally{
      host.viewmodel.root.visible=prevWarmVmVisible;
      host.state.ready=ready;host.state.warming=warming;blood.mist.Clear();blood.drops.Clear();blood.Clear();
      host.vfx.ClearParticles?.();
      post.NotifyCameraCut();
    }
    host.state.actorShaderWarm={mode:retained?"retainedPrograms":"activeScene",ms:performance.now()-start,programs:host.renderer.info.programs.length,bloodDrops,prepassBatchPrimed,shadowBatchPrimed,passProgramsSubmitted:this.passProgramsSubmitted,actorProgramsSubmitted,firstBatch};
    this.warmedSignatures.add(signature);this.FlushRetired();
  }
  FlushRetired() {
    const host=this.host;
    const inUse=new Set(),visit=o=>{for(const m of [o.material,o.customDepthMaterial,o.customDistanceMaterial].flat())if(m)inUse.add(m);};
    host.scene.traverse(visit);for(const kit of this.puppets.xbot.kits.values())kit.source.traverse(visit);
    this.retiredMaterials.Flush(inUse);
  }
  VisibleSpawn(actor) {
    const {camera,battlefield}=this.host;
    camera.updateWorldMatrix(true,false);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().copy(camera.matrixWorld).invert().premultiply(camera.projectionMatrix));
    const y=battlefield.GroundHeight(...actor.p),from=camera.position;
    for(const [offset,height] of [[0,.4],[0,1.1],[0,1.7],[-.35,1.4],[.35,1.4]]) {
      const point=new THREE.Vector3(actor.p[0]+offset,y+height,actor.p[1]);
      if(!frustum.containsPoint(point))continue;
      const direction=point.sub(from),distance=direction.length();
      if(!distance)return true;
      const hit=battlefield.Raycast(from,direction.divideScalar(distance),distance,{terrain:true});
      if(!hit||(hit.t??hit.distance)>=distance-0.1)return true;
    }
    return false;
  }
  Spawn(actor,initial=false) {
    if(this.entries.has(actor.id)||this.plan.dead.has(actor.id))return false;
    if(!initial&&actor.side==="enemy"&&this.VisibleSpawn(actor))return false;
    const spec=EncounterActorSpec(actor,null,this.variant),group=actor.group||this.plan.compiled.groups.find(g=>g.id===actor.groupId);
    let hash=2166136261;for(const c of actor.id)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
    const variants=CHARACTER_RANDOM_VARIANTS_BY_KIND[spec.side];
    const index=Number(actor.id.slice((actor.groupId||"").length+1))||0;
    const combatEnemy=spec.side==="ija"&&(!group||(group.target!=="none"&&group.behavior!=="withdraw"));
    const grenades=combatEnemy
      ?(group?.grenadeInterval>0?2:(group&&["advance","bounds","flank","escort"].includes(group.behavior)&&index%2===0?1:0))
      :0;
    const member = group?.memberPlans?.[index % (group?.maxAlive || 1)];
    const splineCfg = group ? ResolveEncounterGroupSplineConfig(group) : ResolveScriptedSquadConfig(actor.groupId || actor.id);
    const rawRoute = group && ["guard", "suppress"].includes(group.behavior) ? null : actor.route || (group ? GroupPath(group, index) : null);
    const preserveWaypointIndices = !!(member?.waitSeconds || group?.holdUntil || group?.behavior === "bounds");
    const memberRole = index === 0 ? (spec.weapon === "Type11" || spec.weapon === "Zb26" ? "mgGunner" : "leader") : "rifleman";
    const route = rawRoute && rawRoute.length >= 2 && splineCfg && !preserveWaypointIndices
      ? BuildLiveSquadWaypoints({
          squadKey: actor.groupId || actor.id,
          config: splineCfg,
          memberIndex: index,
          memberCount: group?.maxAlive || 1,
          role: memberRole,
          route: rawRoute,
        })
      : rawRoute;
    const squadCtrl = CreateLiveSquadController({
      squadKey: actor.groupId || actor.id,
      config: splineCfg,
      memberIndex: index,
      memberCount: group?.maxAlive || 1,
      role: memberRole,
    });
    let routeIndex=0;
    if(route&&initial) {
      let nearest=Infinity;
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
        const t=length?Math.max(0,Math.min(1,((spec.x-a[0])*dx+(spec.z-a[1])*dz)/length)):0;
        const d=Math.hypot(a[0]+t*dx-spec.x,a[1]+t*dz-spec.z);
        if(d<nearest){nearest=d;routeIndex=t<.001?i-1:i;}
      }
    }
    let futureActor=null;
    if(actor.heading===undefined&&!route) {
      const lookAheadTime=Math.min(this.plan.beat.end,this.plan.time+0.5);
      if(lookAheadTime>this.plan.time+0.01) {
        futureActor=this.plan.variant.evaluate(lookAheadTime,this.plan.document).actors.find(a=>a.id===actor.id)||null;
      }
    }
    const spawnYaw=EncounterInitialActorYaw(actor,{route,routeIndex,futureActor,beat:this.plan.beat});
    spec.yawDeg=spawnYaw*180/Math.PI;
    const soldier=this.host.ai.Spawn(spec.side,spec.x,spec.z,{weapon:spec.weapon,ry:spawnYaw,grenades,
      navPlacement:"authored",squadId:"Encounter_"+(actor.groupId||actor.id),modelVariant:variants[hash%variants.length],...SpeakingCastOptions(spec.castId)});
    if(!soldier)return false;
    const skin=spec.castId||XBOT_FACTION_CHARACTERS[spec.side]?.length?this.puppets.xbot.Attach(soldier.actor,{faction:spec.side,castId:spec.castId,unitId:actor.id}):null;
    if(skin){
      this.host.ai.view.SetSkin(soldier,skin);
      this.host.ai.view.Place(soldier);
      this.host.ai.view.Animate(soldier,0,{
        moveSpeed:0,aim:0,
        crouch:spec.stance==="crouch"?1:0,
        prone:spec.stance==="prone"?1:0,
        grounded:true,dead:spec.state==="down",dying:spec.state==="down"?1:0,
        elapsed:this.host.ai.time,lookYaw:0,lookPitch:0,
      });
    }
    const deployment=(group?.deployDelay||0)+(member?.delay||0);
    const prior=initial?Math.max(0,this.plan.time-(group?.lives[index]?.born??this.plan.time)):0;
    const waitUntil=group?.id==="TempleSearch"?(this.templeEnteredAt??Infinity)+(member?.delay||0)
      :this.plan.elapsed+Math.max(0,deployment-prior);
    let holdOffset=null;
    if(spec.side==="ija"&&route&&route.length>=2&&group&&!member?.route&&(group.count||1)>1&&!/BridgeRush/i.test(group.id)) {
      const end=route.at(-1),prev=route[route.length-2];
      const fdx=end[0]-prev[0],fdz=end[1]-prev[1],flen=Math.hypot(fdx,fdz)||1;
      const fx=fdx/flen,fz=fdz/flen,rx=-fz,rz=fx;
      const lane=(index%3)-1,depth=Math.floor(index/3);
      const ox=rx*lane*2.1-fx*depth*1.6,oz=rz*lane*2.1-fz*depth*1.6;
      const gx=end[0]+ox,gz=end[1]+oz,gy=this.host.battlefield.GroundHeight(gx,gz);
      if((ox||oz)&&!this.host.ai.Blocked(gx,gz,gy))holdOffset=[ox,oz];
    }
    this.entries.set(actor.id,{actor,soldier,spec,skin,group,route,routeIndex,squadCtrl,engaged:!!actor.firing||["shoot","melee"].includes(actor.pose),
      routeWaits:member?.waitSeconds||[],waitedIndex:-1,waitUntil,holdOffset,provoked:false,lastHealth:soldier.health,spottedTime:0});
    if(!initial)this.plan.Spawned(actor);
    return true;
  }
  AliveIds(){return new Set([...this.entries].filter(([,entry])=>entry.soldier.alive).map(([id])=>id));}
  AlertSquad(sourceEntry) {
    sourceEntry.provoked=true;
    const origin=sourceEntry.soldier.position;
    for(const other of this.entries.values()) {
      if(other===sourceEntry||other.spec.side!=="ija"||!other.soldier.alive)continue;
      if((sourceEntry.actor.groupId&&other.actor.groupId===sourceEntry.actor.groupId)
        ||other.soldier.position.distanceTo(origin)<=18) other.provoked=true;
    }
    const player=this.host.player;
    this.host.ai.NoteStimulus("gunshot",player.position,{side:"nra",isPlayer:true,ref:player,loudnessM:28});
  }
  UpdateEnemyAwareness(frame,dt) {
    if(!(dt>0))return;
    const {player,battlefield}=this.host;
    if(!player?.Alive)return;
    const pPos=player.position;
    const stealthHandlesSight=!!this.stealth&&!!frame.stealth?.active;
    const from=new THREE.Vector3(),to=new THREE.Vector3(),dir=new THREE.Vector3();
    for(const entry of this.entries.values()) {
      if(entry.spec.side!=="ija")continue;
      const soldier=entry.soldier;
      if(!soldier.alive)continue;
      if(soldier.health<entry.lastHealth) {
        entry.lastHealth=soldier.health;
        if(!entry.provoked)this.AlertSquad(entry);
        continue;
      }
      entry.lastHealth=soldier.health;
      if(entry.provoked||stealthHandlesSight)continue;
      const group=entry.group;
      const alreadyCombat=group?group.target!=="none"&&group.behavior!=="withdraw"&&this.plan.time>=group.engageAt:entry.engaged;
      if(alreadyCombat)continue;
      const dx=pPos.x-soldier.position.x,dz=pPos.z-soldier.position.z,dist=Math.hypot(dx,dz);
      if(dist>15){entry.spottedTime=Math.max(0,entry.spottedTime-dt*1.5);continue;}
      const cosFront=dist>1e-4?(-Math.sin(soldier.yaw)*dx-Math.cos(soldier.yaw)*dz)/dist:1;
      if(dist>5.0&&cosFront<0.42){entry.spottedTime=Math.max(0,entry.spottedTime-dt*1.5);continue;}
      from.set(soldier.position.x,soldier.position.y+1.45,soldier.position.z);
      let clear=false;
      for(const h of [player.eyeHeight||1.5,(player.eyeHeight||1.5)*0.55]) {
        to.set(pPos.x,pPos.y+h,pPos.z);
        dir.subVectors(to,from);
        const range=dir.length();
        if(range<1e-4){clear=true;break;}
        const hit=battlefield.Raycast(from,dir.divideScalar(range),range,{terrain:true});
        if(!hit||(hit.t??hit.distance)>=range-0.12){clear=true;break;}
      }
      if(clear) {
        entry.spottedTime+=dt*(dist<=5.0?3.5:dist<=9.0?2.0:1.0);
        if(entry.spottedTime>=0.65)this.AlertSquad(entry);
      } else {
        entry.spottedTime=Math.max(0,entry.spottedTime-dt*1.2);
      }
    }
  }
  Order(entry,frame) {
    const {soldier,group,route}=entry;
    if(!soldier.alive||soldier.HasTag?.("timelineControlled"))return;
    const cfg=this.plan.config;
    const reachM=this.stealth&&entry.actor.id==="liu"&&["09a","09b"].includes(frame.beat.id)?0.18:cfg.routeReachM;
    const current=frame.actors.find(a=>a.id===entry.actor.id);
    if(group?.id==="TempleSearch"&&this.templeEnteredAt===null&&!this.stealth?.state?.alarm&&!entry.provoked) {
      this.host.ai.DirectActor(soldier,{x:soldier.position.x,z:soldier.position.z,stance:1,combat:false,moving:false});
      return;
    }
    entry.engaged ||= !!current?.firing||current?.pose==="shoot"||current?.pose==="melee";
    let combat=group?group.target!=="none"&&group.behavior!=="withdraw"&&this.plan.time>=group.engageAt:entry.engaged;
    if((this.stealth?.state?.alarm||entry.provoked) && entry.spec.side==="ija")combat=true;
    const playerPos=this.host.player.position;
    const playerDist=Math.hypot(playerPos.x-soldier.position.x,playerPos.z-soldier.position.z);
    const closeEnemyAlert=combat&&entry.spec.side==="ija"&&playerDist<=12;
    const holdWithdraw=entry.provoked&&group?.behavior==="withdraw";
    const campHeld=group?.holdUntilTime!=null&&this.plan.time<group.holdUntilTime&&!this.stealth?.state?.alarm&&!closeEnemyAlert;
    let target=holdWithdraw?[soldier.position.x,soldier.position.z]:(group&&!route?[entry.spec.x,entry.spec.z]:current?.p||[soldier.position.x,soldier.position.z]),moving=false;
    let escortSpeed=null,escortTethered=false;
    if(group?.behavior==="escort"&&group.tankId&&!holdWithdraw) {
      const tankBrain=this.tanks?.tanks?.get(group.tankId)?.brain;
      const tankActor=frame.actors.find(a=>a.id===group.tankId);
      const tankAlive=tankBrain?!tankBrain.destroyed:!!(tankActor&&tankActor.pose!=="burn"&&!tankActor.disabled);
      if(tankAlive&&(tankBrain||tankActor)) {
        const tx=tankBrain?tankBrain.x:tankActor.p[0],tz=tankBrain?tankBrain.z:tankActor.p[1];
        const tankMoving=tankBrain?tankBrain.moving:!!tankActor?.moving;
        const tankSpeed=tankBrain?tankBrain.speed:2.2;
        const index=Number(entry.actor.id.slice((group.id||"").length+1))||0;
        const slot=index%(group.maxAlive||1);
        const offset=group.spawnOffsets?.[slot];
        let wx=tx+(offset?offset[0]:(slot%2?2.2:-2.2));
        let wz=tz+(offset?offset[1]:-(3.5+slot*3.0));
        if(route?.length) wz=Math.min(wz,route.at(-1)[1]);
        if(this.groundAt(wx,wz)<=1.5) wx=tx+1.8;
        const distToSlot=Math.hypot(wx-soldier.position.x,wz-soldier.position.z);
        target=[wx,wz];
        escortTethered=true;
        if(tankMoving) {
          moving=distToSlot>1.2;
          escortSpeed=Math.max(group.speed||2.2,Math.min(4.2,tankSpeed+0.7));
        } else {
          moving=distToSlot>4.0;
          if(!moving) target=[soldier.position.x,soldier.position.z];
          escortSpeed=group.speed||2.2;
        }
      }
    }
    if(route&&!holdWithdraw&&!escortTethered) {
      const endTarget=entry.routeIndex===route.length-1&&entry.holdOffset
        ?[route[entry.routeIndex][0]+entry.holdOffset[0],route[entry.routeIndex][1]+entry.holdOffset[1]]
        :route[entry.routeIndex];
      const arrived=Math.hypot(soldier.position.x-endTarget[0],soldier.position.z-endTarget[1])<cfg.routeReachM;
      const holdWaypoint=group?.holdUntil?(group.holdUntil.waypoint??1):null;
      const held=campHeld&&holdWaypoint!==null&&entry.routeIndex>=holdWaypoint;
      if(arrived&&entry.waitedIndex!==entry.routeIndex){
        entry.waitedIndex=entry.routeIndex;
        const boundWait=group?.behavior==="bounds"&&entry.routeIndex>0&&entry.routeIndex<route.length-1?(group.coverWaitSeconds??6.5):0;
        entry.waitUntil=Math.max(entry.waitUntil,this.plan.elapsed+(entry.routeWaits[entry.routeIndex]||boundWait));
      }
      if(arrived&&!held&&(this.plan.elapsed>=entry.waitUntil||this.stealth?.state?.alarm||closeEnemyAlert)&&entry.routeIndex<route.length-1)entry.routeIndex++;
      target=entry.routeIndex===route.length-1&&entry.holdOffset
        ?[route[entry.routeIndex][0]+entry.holdOffset[0],route[entry.routeIndex][1]+entry.holdOffset[1]]
        :route[entry.routeIndex];
      if((held&&arrived)||(this.plan.elapsed<entry.waitUntil&&!this.stealth?.state?.alarm&&!closeEnemyAlert))target=[soldier.position.x,soldier.position.z];
    }
    if(!escortTethered) moving=Math.hypot(target[0]-soldier.position.x,target[1]-soldier.position.z)>reachM;
    if(group?.suppressedBy?.some(id=>[...this.entries.values()].some(e=>e.actor.groupId===id&&e.soldier.alive&&e.soldier.targetVisible))) {
      if(group.suppressionStop)target=group.suppressionStop;
      moving=Math.hypot(target[0]-soldier.position.x,target[1]-soldier.position.z)>cfg.routeReachM;
    }
    const guide=!!this.stealth&&entry.actor.id==="liu"&&frame.beat.id==="09a";
    const baseSpeed=guide?Math.max(2.6,Math.hypot(this.host.player.velocity.x,this.host.player.velocity.z)*1.15):(escortSpeed??group?.speed??2.6);
    const speed=entry.squadCtrl
      ? baseSpeed * entry.squadCtrl.SpeedScale(this.plan.elapsed, moving && !combat && !guide && !escortTethered)
      : baseSpeed;
    const suspicionObserver=this.stealth?.state?.suspicion>0 && entry.actor.id===this.stealth.observerId;
    if(suspicionObserver){target=[soldier.position.x,soldier.position.z];moving=false;}
    const {yaw,forceYaw}=EncounterOrderYaw({
      currentHeading:current?.heading,
      afterRouteLookAt:group?.afterRouteLookAt,
      position:soldier.position,
      moving,
      combat,
      routeFinished:!!route&&entry.routeIndex===route.length-1,
      guide,
      target,
      suspicionPlayer:suspicionObserver?this.host.player.position:null,
    });
    const allowCover=combat&&!guide;
    const isEnemyCombat=combat&&!guide&&entry.spec.side==="ija";
    const isBayonetRush=isEnemyCombat&&!!group&&/BridgeRush/i.test(group.id);
    const isMgPost=isEnemyCombat&&!!group&&(["guard","suppress"].includes(group.behavior)||(group.weapon==="machineGun"&&!moving));
    const tacticalRadiusM=isEnemyCombat
      ?(isBayonetRush?24:escortTethered?12:isMgPost?8:group?.behavior==="flank"?16:group?.behavior==="bounds"?14:16)
      :0;
    const authoredStance=guide&&speed>3.5?0:current?.pose==="prone"?2:current?.pose==="kneel"||current?.pose==="crouch"?1:0;
    const artilleryEvade=entry.spec.side==="nra"&&!guide?this.artillery?.EvasionFor(soldier.position):null;
    if(artilleryEvade) {
      const evadeX=soldier.position.x+artilleryEvade.away[0]*1.8;
      const evadeZ=soldier.position.z+artilleryEvade.away[1]*1.8;
      const evadeY=this.groundAt(evadeX,evadeZ);
      const canShift=!this.host.ai.Blocked?.(evadeX,evadeZ,evadeY);
      this.host.ai.DirectActor(soldier,{
        x:canShift?evadeX:soldier.position.x,
        z:canShift?evadeZ:soldier.position.z,
        yaw,forceYaw:false,stance:1,combat:false,moving:canShift,speed:3.2,
        arrivalRadius:0.45,allowCover:false,coverSlackM:0,suppressible:true,tacticalRadiusM:0,fixBayonet:false,
        gazeYaw:0,gazePitch:0,
      });
      return;
    }
    let gazeYaw = 0, gazePitch = 0;
    if (!suspicionObserver && entry.squadCtrl) {
      const peers = [];
      if (entry.actor.groupId) {
        for (const other of this.entries.values()) {
          if (other === entry || !other.soldier.alive || other.actor.groupId !== entry.actor.groupId) continue;
          peers.push({ id: other.actor.id, x: other.soldier.position.x, z: other.soldier.position.z });
          if (peers.length >= 4) break;
        }
      }
      const stageNum = Number(frame.beat?.stage || 0);
      const terrainKind = stageNum <= 3 ? "trench" : (stageNum >= 8 && stageNum <= 10 ? "alley" : "open");
      const g = entry.squadCtrl.StepGaze(cfg.orderEveryS, {
        x: soldier.position.x,
        y: soldier.position.y,
        z: soldier.position.z,
        yaw: soldier.yaw,
        speed: soldier.moveSpeed || 0,
        combat,
        aiming: (soldier.aimBlend || 0) > 0.15 || !!soldier.target,
        terrainKind,
        peers,
      });
      gazeYaw = g.gazeYaw;
      gazePitch = g.gazePitch;
    }
    this.host.ai.DirectActor(soldier,{x:target[0],z:target[1],yaw,forceYaw,
      stance:allowCover?null:authoredStance,
      combat,moving,speed,arrivalRadius:Math.min(reachM,0.7),
      allowCover,coverSlackM:allowCover?(escortTethered?6.5:8.5):0,suppressible:allowCover,
      tacticalRadiusM,fixBayonet:isBayonetRush,gazeYaw,gazePitch});
  }
  NoFireArmed(frame) {
    return !!frame.stealth?.noFire&&this.host.player.position.z>=(frame.stealth.armMinZ??-Infinity);
  }
  UpdateMissionArea(frame,dt) {
    const {player}=this.host;
    if(!this.areaGuard||!player)return false;
    const area=ResolveEncounterMissionArea(frame.beat,this.variant,this.plan.compiled);
    const controlled=!player.Alive||!!player.debug?.noCollision||!!this.stealth?.CapturesInput()||!!frame.beat?.cinematic||this.plan.completed;
    const view=this.areaGuard.Update(dt,{step:frame.beat.id,point:player.position,area,controlled});
    this.host.hud.SetMissionArea?.(view.warning?view:null);
    if(view.failed){
      this.areaFailure=T("firstLevel.return.boundary");
      this.host.hud.SetMissionArea?.(null);
      this.Fail();
      return true;
    }
    return false;
  }
  Update(dt) {
    if(!this.active||this.paused||!this.ready||this.disposed)return;
    if(this._openingActive){
      this.opening.Update(dt);
      return;
    }
    this.timelines?.Update(dt);
    if(this.timelines?.IsBlockingInput())return;
    if(!this.combatStarted)return;
    if(this.failed){this.RenderHud();return;}
    const {player,state}=this.host,cfg=this.plan.config;
    for(const [id,entry] of this.entries)if(!entry.soldier.alive)this.plan.Kill(id);
    if(!player.Alive){this.Fail();return;}
    const alive=this.AliveIds();
    const before=this.plan.Frame();
    let stealth={active:!!before.stealth?.active,alarm:false,failed:false};
    if(this.stealth) {
      stealth=this.stealth.Update(before,dt,this.entries);
    } else {
      const totalGrenades=state.grenades+state.bundles;
      const brokeNoFire=this.NoFireArmed(before)&&(state.playerShots>this.noFireShots||totalGrenades<this.noFireGrenades);
      this.noFireShots=state.playerShots;
      this.noFireGrenades=totalGrenades;
      if(brokeNoFire){this.noFireFailure="响枪惊动了院内日军";this.Fail();return;}
    }
    this.SaveCheckpoint();
    if(stealth.failed) {
      this.Fail();return;
    }
    if(stealth.alarm && !this.alarmAnnounced) {
      this.alarmAnnounced=true;
      this.host.ai.NoteStimulus("gunshot",player.position,{side:"nra",isPlayer:true,ref:player,loudnessM:30});
    }
    const previousBeat=this.plan.beat.id;
    const departed=[];
    for(const group of this.plan.compiled.groups){
      const entries=[...this.entries.values()].filter(e=>e.actor.groupId===group.id);
      if(this.plan.groups.get(group.id).count>=group.count&&entries.every(e=>!e.soldier.alive||e.route&&e.routeIndex===e.route.length-1&&Math.hypot(e.soldier.position.x-e.route.at(-1)[0],e.soldier.position.z-e.route.at(-1)[1])<cfg.routeReachM))departed.push(group.id);
    }
    const escorted=[...this.puppets.puppets.values()].filter(p=>/^stretcher\d+$/.test(p.id)&&p.z>=cfg.escortExitZ).length;
    const facts=[];for(const [fact,p] of this.pendingActions)if(!p.alive){facts.push(fact);this.pendingActions.delete(fact);}
    if(!stealth.alarm)this.plan.Step(dt,[player.position.x,player.position.z],alive,{departed,escorted,facts,partyArrived:this.PartyAtEndpoint()});
    if(this.isCampaign&&this.plan.completed&&!this.completedHandled&&!this.endingPlaying){
      if(this.timelines?.Get("FirstLevelBridgeDemolition")?.active){
        // Wait for the concurrent 13d bridge demolition setpiece to finish before cutting to 13e.
      } else if(this.variant.id===FIRST_LEVEL_CAMPAIGN_VARIANT_ID&&this.variant.cinematics?.includes("13e")){
        this.PlayEndingTimeline();
        return;
      } else {
        this.FinishCampaign();
        return;
      }
    }
    const frame=this.plan.Frame();
    this.SyncEnvironment(frame);
    this.SaveCheckpoint();
    if(this.UpdateMissionArea(frame,dt))return;
    if(this.stealth&&previousBeat!==frame.beat.id&&frame.beat.id==="09b") {
      this.templeEnteredAt=this.plan.elapsed;
      for(const entry of this.entries.values())if(entry.actor.groupId==="TempleSearch") {
        const index=Number(entry.actor.id.split("_").at(-1));
        entry.waitUntil=this.templeEnteredAt+(entry.group.memberPlans?.[index]?.delay||0);
        entry.waitedIndex=-1;
      }
    }
    const companionTime=this.stealth?this.stealth.CompanionFrameTime(frame,this.entries,this.plan.elapsed):null;
    if(companionTime!==null) {
      const companions=["player","liu","nier"].map(id=>{
        const actor=frame.actors.find(a=>a.id===id);
        return {id,p:[...actor.p],pose:actor.pose};
      });
      companions[0].p=SampleBeatRoute(frame.beat,(companionTime-frame.beat.start)/frame.beat.duration);
      StageVillageCompanions(companions,companionTime,this.variant.timeline);
      for(const source of companions.slice(1)) {
        const actor=frame.actors.find(a=>a.id===source.id);
        Object.assign(actor,{p:source.p,pose:source.pose,heading:source.heading,status:source.status});
      }
    }
    const signals=EncounterSceneSignals(frame,this.plan.facts,this.variant);signals.add("Stage0105Done");
    for(const [id,on] of this.timelineSignals){if(on)signals.add(id);else signals.delete(id);}
    this.sceneSignals=[...signals];
    const signalKey=[...signals].join(",");
    if(this.signalKey!==signalKey){
      this.signalKey=signalKey;
      const changed=this.host.battlefield.RestoreScenario?.({signalled:id=>signals.has(id)});
      if(changed)this.host.ctx.navGrid?.Refresh?.(this.host.battlefield,{spread:true});
    }
    for(const actor of frame.actors)if(this.IsSoldier(actor)&&!this.plan.groups.has(actor.groupId))this.Spawn(actor);
    for(const actor of this.plan.Spawns(alive))this.Spawn(actor);
    this.UpdateEnemyAwareness(frame,dt);
    this.orderClock-=dt;
    if(this.orderClock<=0){for(const entry of this.entries.values())this.Order(entry,frame);this.orderClock=cfg.orderEveryS;}
    const tankOverrides=this.tanks.Update(frame,dt,this.entries);
    this.artillery?.Update(dt,frame,{playerPos:player.position,stealthActive:!!(stealth.active||frame.stealth?.active)});
    const units=frame.actors.filter(a=>a.id!=="player"&&!this.entries.has(a.id)&&!this.plan.groups.has(a.groupId)).map(a=>{
      const spec=EncounterActorSpec(a,frame.actors.find(parent=>parent.id===a.parentId),this.variant);
      if(a.side==="civilian"&&!spec.castId&&["person","child"].includes(a.kind))spec.castId=a.kind==="child"?"nier":"geng";
      if(a.kind==="litter")spec.kind="litter";
      if(a.kind==="tank"){
        const ov=tankOverrides.get(a.id);
        if(ov){
          if(Number.isFinite(ov.x))spec.x=ov.x;
          if(Number.isFinite(ov.z))spec.z=ov.z;
          if(Number.isFinite(ov.hullYawDeg))spec.yawDeg=ov.hullYawDeg;
          if(Number.isFinite(ov.turretYawDeg))spec.arc={yawDeg:ov.turretYawDeg};
        }
      }
      if(a.heading===undefined&&!a.parentId)spec.yawDeg=EncounterPuppetYaw(this.puppets.puppets.get(a.id),spec,dt,cfg.puppetFacing);
      return spec;
    });
    units.push({...EncounterActorSpec({id:"player",name:"",side:"player",kind:"person",p:[player.position.x,player.position.z],pose:"stand"},null,this.variant),
      yawDeg:player.yaw*180/Math.PI,stance:player.stance,state:"alive",visible:this.view.count===2||this.preparingPuppets===true,
      weapon:state.activeSlot==="melee"?"Dadao":this.host.Weapon()});
    this.puppets.SyncFrame(units,dt,this.view.count===2?null:player.position);
    this.tanks.PostSync(dt);
    this.playerPuppet=this.puppets.puppets.get("player");
    this.SetPlayerPuppetVisible(false);
    this.view.Update(id=>this.Position(id),dt);
    for(const actor of frame.actors)if(actor.kind==="tank"&&actor.pose==="burn"&&!this.smoke.has(actor.id)){
      const liveTank=this.tanks?.tanks?.get(actor.id)?.brain;
      const sx=liveTank?liveTank.x:actor.p[0],sz=liveTank?liveTank.z:actor.p[1];
      const point=new THREE.Vector3(sx,this.host.battlefield.GroundHeight(sx,sz)+.7,sz);
      this.smoke.set(actor.id,this.host.vfx.SmokeSource(point,{kind:"black",rate:7,life:5}));
    }
    const cue=this.failed||this.plan.completed?null:cfg.music[this.plan.beat.stage];
    if(cue!==this.music){this.music=cue;this.host.audio.Music(cue,{fadeOut:1.6,levelScale:0.7});}
    this.RenderHud(frame);
    if(this.plan.elapsed-this.lastStateSent>0.2||this.lastBeat!==this.plan.beat.id){
      this.lastStateSent=this.plan.elapsed;this.lastBeat=this.plan.beat.id;this.Send("state",{state:this.State()});
    }
  }
  ApplyCamera(camera) {
    if(this._openingActive)return this.opening.ApplyCamera(camera);
    if(this.timelines?.ApplyCamera(camera))return true;
    return false;
  }
  SetPlayerPuppetVisible(visible){for(const human of this.playerPuppet?.humans||[]){
    // This proxy is revealed only inside the observer draw, after the main
    // camera's batch collection. Keep its attachments on their ordinary Mesh path.
    this.host.ctx.actorBatch?.Remove(human.actor);human.actor.root.visible=visible;
  }}
  Position(id) {
    if(id==="player")return this.host.player.position;
    const entry=this.entries.get(id);if(entry)return entry.soldier.position;
    const puppet=this.puppets.puppets.get(id);
    if(puppet?.humans[0])return puppet.humans[0].actor.root.getWorldPosition(new THREE.Vector3());
    return puppet?new THREE.Vector3(puppet.x,this.host.battlefield.GroundHeight(puppet.x,puppet.z),puppet.z):null;
  }
  PartyAtEndpoint() {
    if(!this.stealth||this.plan.beat.id!=="09b")return false;
    const end=this.plan.beat.p.at(-1),reachM=this.plan.config.reachM;
    return ["liu","nier"].every(id=>{
      if(this.plan.dead.has(id))return true;
      const position=this.Position(id);
      return position&&Math.hypot(position.x-end[0],position.z-end[1])<reachM;
    });
  }
  Interact() {
    if(!this.active||this.paused||!this.ready||this.openingActive||!this.combatStarted||this.failed||this.plan.completed)return false;
    const p=this.host.player.position;
    if(!this.plan.CanInteract([p.x,p.z]))return false;
    const action=this.plan.gate.action;
    if(action==="returnGrenade"){
      const projectile=this.host.combat.Throw("Grenade",.6,this.host.player.EyePosition,this.host.camera.getWorldDirection(new THREE.Vector3()),0);
      if(!projectile)return false;this.pendingActions.set("grenadeReturned",projectile);
    }
    if(action==="plantFirst"||action==="plantSecond"){
      if(this.host.state.bundles<=0)return false;
      const id=action==="plantFirst"?"tank1":"tank2",tank=this.plan.Frame().actors.find(a=>a.id===id);
      if(!tank)return false;
      const liveTank=this.tanks?.tanks?.get(id)?.brain;
      const tx=liveTank?liveTank.x:tank.p[0],tz=liveTank?liveTank.z:tank.p[1];
      const pos=new THREE.Vector3(tx,this.host.battlefield.GroundHeight(tx,tz)+.2,tz);
      const projectile=this.host.combat.Throw("GrenadeBundle",0,pos,new THREE.Vector3(0,-1,0),0,{handRelease:true});
      if(!projectile)return false;this.host.state.bundles--;this.pendingActions.set(id+"Destroyed",projectile);
    }
    if(action==="bandageWinter"){if(this.host.player.bandages<=0)return false;this.host.player.bandages--;}
    if(action==="detonateRailBridge"){
      this.timelines?.Play(FIRST_LEVEL_BRIDGE_DEMO_TIMELINE_URL,{key:"FirstLevelBridgeDemolition"}).catch(()=>{});
    }
    this.plan.Interact();
    return true;
  }
  OnKey(detail) {
    if(this._openingActive){
      if(detail.code==="Escape")return undefined;
      if(detail.code==="Space"&&detail.down&&!detail.repeat){this.SkipOpening();return true;}
      return true;
    }
    const tlHandled=this.timelines?.OnKey(detail);
    if(tlHandled!==undefined)return tlHandled;
    if(detail.code==="KeyR" && detail.down && !detail.repeat && this.failed)return this.Retry();
    if(this.stealth?.CapturesInput() && detail.down && !["Escape","KeyO"].includes(detail.code))return true;
    if(!this.isCampaign&&detail.code==="KeyO"&&this.view.count===2) {
      if(detail.down&&!detail.repeat) {
        if(this.view.focused){this.view.canvas.blur();this.host.Focus({fromClick:true});}
        else {this.host.ctx.ReleasePointerLock();this.view.mode="free";this.view.canvas.focus();}
      }
      return true;
    }
    if(detail.code==="KeyF"&&detail.down!==false&&this.plan.gate.action&&!this.AimedPickup())return this.Interact();
  }
  // A gun the player is looking straight at keeps F for pickup/swap inside a beat action area, as in the main game.
  AimedPickup(){const c=this.host.interact?.Query(this.host.player);return c?.kind==="pickup"&&c.aimed?c:null;}
  OwnsInteractKey(){const p=this.host.player.position;return this.active&&this.ready&&!this.openingActive&&this.plan.CanInteract([p.x,p.z])&&!this.AimedPickup();}
  ObjectiveText() {
    if(this.openingActive||!this.combatStarted)return "";
    if(!this.hudInfo)return this.plan.beat.task||"";
    const beatId=this.plan.beat.id.toUpperCase();
    const beatTitle=this.plan.beat.title||"";
    const head=beatTitle&&this.hudInfo.task?.startsWith(beatTitle)
      ?`${beatId} · ${this.hudInfo.task}`
      :`${this.hudInfo.title} · ${this.hudInfo.task}`;
    return this.hudInfo.campaignHint?`${head} — ${this.hudInfo.campaignHint}`:head;
  }
  RenderHud(frame=this.plan.Frame()) {
    const ui=this.plan.config.ui,reachM=this.plan.config.reachM;
    const stealthState=this.stealth?.state||null;
    const currentTask=this.stealth&&frame.beat.id==="09b"&&this.stealth.exitStartedElapsed!==null?ui.templeExit:this.plan.beat.task;
    const task=stealthState?.active||this.NoFireArmed(frame)?`${currentTask} · ${ui.stealthNoFire}`:frame.stealth?.noFire?`${currentTask} · ${ui.stealthNoFireAhead}`:currentTask;
    const title=this.plan.beat.id.toUpperCase()+" · "+this.plan.beat.title;
    const status=this.failed&&this.areaFailure?this.areaFailure
      :this.failed&&this.noFireFailure?this.noFireFailure
      :this.failed&&stealthState?.active?(stealthState.failure||ui.dead)
      :this.failed?ui.dead:stealthState?.alarm?ui.stealthAlarm:stealthState?.suspicion>0?ui.stealthSuspicion:this.plan.completed?ui.complete:task;
    const p=this.host.player.position,end=this.plan.gate.retreat&&this.plan.interacted.has(this.plan.beat.id)?this.plan.beat.p.at(-1):this.plan.Area().center,distance=Math.hypot(p.x-end[0],p.z-end[1]);
    const hint=this.failed&&(stealthState?.active||this.noFireFailure)?ui.stealthRetry:stealthState?.locked?ui.stealthPull:this.stealth&&frame.beat.id==="09b"&&distance<=reachM&&!this.PartyAtEndpoint()?ui.waitParty:stealthState?.active&&frame.beat.id==="09b"&&this.stealth.exitStartedElapsed===null?ui.stealthWait:this.failed?ui.retry:this.plan.completed?ui.stop:
      this.OwnsInteractKey()?ui.interact:
      this.plan.waiting==="combat"?ui.clear:this.plan.waiting==="event"?ui.event:this.plan.waiting==="escort"?ui.escort:this.plan.waiting==="departure"?ui.departure:distance>reachM?ui.reach+" "+distance.toFixed(0)+" m":"";
    const dialogue=EncounterDialogueLines(this.plan,frame,{failed:this.failed,exit:!!(this.stealth&&this.stealth.exitStartedElapsed!==null),
      interact:this.OwnsInteractKey()});
    this.speech.Set(frame,dialogue);
    const actions=this.host.hud.el?.actions?.textContent?.trim()||"";
    const notice=this.host.hud.el?.hint?.classList.contains("on")?this.host.hud.el.hint.textContent.trim():"";
    const help=(this.failed?[hint]:[hint,actions,notice]).filter(Boolean).join(" · ");
    this.RenderFailure(status,this.failed?hint:ui.stop);
    const key=JSON.stringify([title,status,help,hint,dialogue]);
    if(key===this.hudKey)return;this.hudKey=key;
    this.hudInfo={title,task:status,hint:help,campaignHint:this.failed||this.plan.completed?"":hint};
  }
  AfterRender(dt,options){
    if(this.openingActive)return;
    this.view.Render(dt,options,()=>this.SetPlayerPuppetVisible(true),()=>this.SetPlayerPuppetVisible(false));
    this.speech.Render();
  }
  RequestStop(){if(window.parent!==window)this.Send("stop");else history.back();}
  Send(kind,extra={}){if(!this.isCampaign&&window.parent!==window)window.parent.postMessage({type:"encounter-play-"+kind,token:this.token,...extra},location.origin);}
  Actors(){return [...this.entries].map(([id,e])=>({id,soldierId:e.soldier.id,alive:e.soldier.alive,health:e.soldier.health,position:e.soldier.position.toArray(),model:e.skin?.kit?.key||e.soldier.actor?.characterRig?.modelId,group:e.actor.groupId||null}));}
  Presentation(){return [...this.puppets.puppets.values()].map(p=>({id:p.id,kind:p.unit.kind,stance:p.stance,x:p.x,z:p.z,yawDeg:p.yawDeg,moving:!!p.moving,
    model:p.body?.userData.model?.kind||(p.body?.userData.model?.tank?"tank":p.body?.userData.model?.tankette?"type94Tankette":null),
    humans:p.humans.map(h=>h.skin?.kit?.key||h.actor.characterRig?.modelId||null)}));}
  Stages(){
    const currentStageId=this.openingActive||this.pendingOpening?this.variant.stages[0]?.id:this.plan.beat.stage;
    return this.variant.stages.map((stage,index)=>({
      number:index+1,id:stage.id,title:stage.title,
      entryBeat:(index===0?EncounterFirstPlayable(this.variant):stage.beats.find(b=>EncounterCanPlay(b.start,this.variant))||stage.beats[0])?.id||null,
      opening:index===0,current:stage.id===currentStageId,
    }));
  }
  MissionState(){
    const stageId=this.openingActive||this.pendingOpening?this.variant.stages[0]?.id:this.plan.beat.stage;
    const stageIndex=Math.max(0,this.variant.stages.findIndex(s=>s.id===stageId));
    const stageObj=this.variant.stages[stageIndex]||this.variant.stages[0];
    return {
      mode:this.mode,variant:this.variant.id,scene:this.plan.config.scene,
      stage:stageObj?.id||stageId,stageNumber:stageIndex+1,stageTitle:stageObj?.title||"",
      beat:this.openingActive||this.pendingOpening?(this.opening?.State().keyframe||"01-1"):this.plan.beat.id,
      opening:this.openingActive,pendingOpening:this.pendingOpening,openingState:this.opening?.State()||null,
      timelines:this.timelines?.State()||null,
      time:this.openingActive?(this.opening?.State().t||0):this.plan.time,
      elapsed:this.plan.elapsed,waiting:this.plan.waiting,completed:this.plan.completed,failed:this.failed,
      objective:this.ObjectiveText(),alive:this.AliveIds().size,actors:this.Actors(),tanks:this.tanks?.State()||[],artillery:this.artillery?.State()||[],
      dead:[...this.plan.dead],triggers:[...this.plan.triggers.keys()],signals:this.sceneSignals||[],
      missionArea:this.areaGuard?.State()??null,
    };
  }
  State(){return {...this.plan.State(),mode:this.mode,hostId:this.hostId,active:this.active,paused:this.paused,starting:this.starting,initialized:this.initialized,ready:this.ready&&!this.starting,opening:this.openingActive,pendingOpening:this.pendingOpening,openingState:this.opening?.State()||null,timelines:this.timelines?.State()||null,hints:this.hudInfo||{},dialogue:this.speech.State(),error:this.error||null,failed:this.failed,stealth:this.stealth?this.stealth.state:(this.plan.Frame().stealth||null),missionArea:this.areaGuard?.State()??null,layout:this.view.count,view:this.view.State(),music:this.music,alive:this.AliveIds().size,actors:this.Actors(),tanks:this.tanks?.State()||[],artillery:this.artillery?.State()||[],signals:this.sceneSignals||[]};}
  CapturesInput() {
    return !this.active || this.paused || this.starting || !this.ready || this.openingActive || !this.combatStarted || this.failed || !!this.stealth?.CapturesInput()
      || (this.stealth?VillageStealthAt(this.plan.time,this.variant.timeline).locked:false)
      || this.view.count===2&&this.view.focused;
  }
  Fail() {
    if(this.failed)return true;
    this.failed=true;
    this.host.hud.SetMissionArea?.(null);
    this.host.audio.Music(null,{fadeOut:0.2});
    this.RenderHud();this.Send("state",{state:this.State()});
    if(this.isCampaign)this.onFail?.(this.MissionState());
    return true;
  }
  SaveCheckpoint() {
    const stealth=this.stealth?VillageStealthAt(this.plan.time,this.variant.timeline):{active:false};
    const desiredTime=stealth.active?stealth.checkpoint:this.plan.beat.start;
    if(this.checkpointTime===desiredTime)return;
    // The approach checkpoint can reference a skipped cinematic (08F).
    const time=this.variant.timeline.find(beat=>beat.start>=desiredTime&&EncounterCanPlay(beat.start,this.variant)).start;
    if(this.checkpointTime===time)return;
    const preserveInventory=this.checkpointTime===null&&stealth.active&&this.checkpointInventory;
    this.checkpointTime=time;
    // Entering the temple keeps the supplies saved at its approach checkpoint.
    if(preserveInventory)return;
    const {state,player}=this.host;
    const mags=structuredClone(state.mags);
    if(mags[state.activeSlot])Object.assign(mags[state.activeSlot],{ammo:state.ammo,clips:state.clips});
    this.checkpointInventory={weapon:this.host.Weapon(),activeSlot:state.activeSlot,lastGunSlot:state.lastGunSlot,
      slots:{...state.slots},mags,weaponVariants:{...state.weaponVariants},bayonets:{...state.bayonets},
      bayonetFixed:state.bayonetFixed,fireMode:state.fireMode,
      ammo:state.ammo,clips:state.clips,grenades:state.grenades,bundles:state.bundles,health:player.health,
      bleeding:player.bleeding,bandages:player.bandages,stamina:player.stamina,wounds:structuredClone(player.wounds)};
  }
  RestoreCheckpointInventory() {
    const saved=this.checkpointInventory;
    if(!saved)return;
    const {state,player}=this.host;
    if(saved.slots) {
      for(const key of ["slots","mags","weaponVariants","bayonets"])state[key]=structuredClone(saved[key]);
      this.host.ctx.ActivateSlot(saved.activeSlot);
      Object.assign(state,{lastGunSlot:saved.lastGunSlot,bayonetFixed:saved.bayonetFixed,fireMode:saved.fireMode});
    } else if(saved.weapon && this.host.Weapon()!==saved.weapon)this.host.Pickup(saved.weapon);
    Object.assign(state,{ammo:saved.ammo,clips:saved.clips,grenades:saved.grenades,bundles:saved.bundles});
    if(state.mags[state.activeSlot])Object.assign(state.mags[state.activeSlot],{ammo:saved.ammo,clips:saved.clips});
    for(const key of ["health","bleeding","bandages","stamina"]) {
      if(saved[key]!==undefined)player[key]=saved[key];
    }
    if(saved.wounds)player.wounds=structuredClone(saved.wounds);
  }
  Retry({force=false}={}) {
    if(!this.active || !this.ready || this.starting || this.disposed || (!this.failed&&!force))return false;
    if(this._openingActive){this.opening.Stop();this._openingActive=false;this.pendingOpening=false;}
    this.timelines?.Stop();this.timelineSignals.clear();this.endingPlaying=false;
    const plan=new EncounterPlayPlan(this.plan.document,this.checkpointTime??this.plan.beat.start,this.variant);
    const {player,state,combat,battlefield,vfx,ctx}=this.host;
    this.host.audio.ResetSession();
    ctx.gore?.ReleaseAll();ctx.meleeCombat?.Reset();
    this.host.interact.Clear();this.host.interact.ClearGroundWeapons();ctx.ClearLooseGuns();
    for(const entry of this.entries.values())this.host.ai.Remove(entry.soldier);
    this.entries.clear();
    this.host.ai.tactics.Reset();
    this.tanks?.Reset();
    this.artillery?.Reset();
    this.puppets.SyncFrame([],0);
    combat.ClearProjectiles();
    this.pendingActions.clear();
    battlefield.deformation?.Reset();
    vfx.ClearParticles();
    vfx.ClearGroundImpacts();
    for(const source of this.smoke.values())vfx.RemoveSmokeSource(source);
    this.smoke.clear();
    Object.assign(this,{
      plan,failed:false,completedHandled:false,combatStarted:true,noFireFailure:null,areaFailure:null,paused:false,alarmAnnounced:false,templeEnteredAt:this.stealth&&plan.beat.id==="09b"?0:null,
      orderClock:0,lastBeat:null,lastStateSent:-1,hudKey:null,signalKey:null,music:null
    });
    this.areaGuard?.Reset();this.host.hud.SetMissionArea?.(null);
    ctx.RespawnPlayer(true);
    const p=plan.Frame().player;
    player.Spawn(...p,EncounterPlayerYaw(plan.beat));
    this.RestoreCheckpointInventory();
    ctx.ApplyDebugOptions({reload:true});
    Object.assign(state,{playerAliveLast:true,pendingRespawn:false,deathTimer:0,cooking:null,cook:0,playerShots:0,lastShot:null,menu:false,running:true});
    ctx.ClearFirearmRequests();
    ctx.router.SetSuppressed(true);
    ctx.router.SetSuppressed(false);
    ctx.menu?.Close();this.host.hud.HideDeathCard?.();this.host.hud.ClearStaging?.();ctx.viewmodel.ResetDeath?.();
    if(this.isCampaign&&ctx.hudRoot)ctx.hudRoot.style.display="";
    ctx.viewmodel.Equip(this.host.Weapon(),state.weaponVariants[state.activeSlot]||0,{instant:true});
    ctx.SyncBayonet();
    ctx.viewmodel.root.visible=true;
    this.stealth?.Reset();
    this.noFireShots=state.playerShots;
    this.noFireGrenades=state.grenades+state.bundles;
    for(const actor of plan.initial)if(this.IsSoldier(actor))this.Spawn(actor,true);
    this.host.post.NotifyCameraCut();this.view.post?.NotifyCameraCut();
    this.Update(0);
    this.host.audio.SetPaused(false);this.host.audio.ctx?.resume().catch(()=>{});
    if(this.isCampaign)ctx.RequestPointerLock?.();
    this.Send("state",{state:this.State()});
    return true;
  }
  Dispose() {
    if(this.disposed)return;this.disposed=true;this.ready=false;
    if(this.previousMissionCoverRules!==undefined)this.host.ai.missionCoverRules=this.previousMissionCoverRules;
    if(this.previousMissionReactions!==undefined)this.host.ai.missionReactions=this.previousMissionReactions;
    this.opening?.Dispose();
    this.timelines?.Dispose();
    this.tanks?.Dispose();
    this.RestoreBlastHook();
    this.host.audio.Music(null,{fadeOut:0});this.host.audio.Dispose();this.view.Dispose();
    for(const entry of this.entries.values())this.host.ai.Remove(entry.soldier);
    for(const id of this.smoke.values())this.host.vfx.RemoveSmokeSource(id);
    this.entries.clear();this.puppets.Dispose();if(this.onMessage)window.removeEventListener("message",this.onMessage);
    this.retiredMaterials.Flush();
    this.areaGuard?.Reset();this.areaFailure=null;this.host.hud.SetMissionArea?.(null);
    this.speech.Dispose();this.failureCard.remove();this.style.remove();
    document.body.classList.remove("encounterGame","encounterCampaign","encounterOpening");
  }
}
