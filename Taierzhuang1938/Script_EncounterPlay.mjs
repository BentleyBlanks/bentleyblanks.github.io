import * as THREE from "three";
import { EncounterPlayPlan, EncounterCanPlay, EncounterActorSpec, EncounterPlayerYaw, EncounterSceneSignals, ENCOUNTER_PLAY_CONFIG as CONFIG } from "./Script_EncounterPlayPlan.mjs";
import { CompileEncounterVariant } from "./Script_EncounterVariants.mjs";
import { VillageStealthRules, VillageStealthAt, StageVillageCompanions } from "./Scenes/FirstLevelEncounter/Script_LevelFlowVillage.mjs";
import { SampleBeatRoute } from "./Scenes/FirstLevelEncounter/Script_LevelFlowGeometry.mjs";
import { VillageStealthPlay } from "./Script_VillageStealthPlay.mjs";
import { GroupPath } from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import { BlockoutPuppets } from "./Script_EditorBlockoutPuppets.mjs";
import { SpeakingCastOptions } from "./Script_FirstLevelSpeakingCast.mjs";
import { EncounterPlayView } from "./Script_EncounterPlayView.mjs";
import { EncounterPlayDialogue, EncounterDialogueLines } from "./Script_EncounterPlayDialogue.mjs";
import { LoadToolsVolume, ToolsVolumeLevel } from "./Script_EditorVolume.mjs";
import { ENCOUNTER_PLAY_STARTUP } from "./Data_Tuning_EncounterPlayStartup.mjs";
import { XBOT_CAST_CHARACTERS, XBOT_FACTION_CHARACTERS } from "./Data_XBotCharacters.mjs";
import { PrepareWoundMaterials } from "./Script_CharacterWounds.mjs";
import { AddGoreWarmProxies } from "./Script_CharacterGore.mjs";
import { DeferredMaterialDispose } from "./Script_DeferredMaterialDispose.mjs";
import { CHARACTER_RANDOM_VARIANTS_BY_KIND } from "./Data_CharacterSelection.mjs";
import { XBOT_DEATHS, XBOT_NATIVE, XBOT_LOCOMOTION_4WAY, XBOT_TURN_IN_PLACE } from "./Data_BlockoutXBotClips.mjs";
import { PreloadDeathLibrary } from "./Script_HitReactionLayer.mjs";
import { LoadEncounterCast } from "./AdvancedTools/Script_EncounterCastLibrary.mjs";
import { SubmitEncounterPrograms, SubmitEncounterActorPrograms } from "./Script_EncounterShaderWarmup.mjs";
import { T } from "./Script_Text.mjs";

const PAYLOAD_KEY="tengxian1938_encounter_play_session_v1";
const UI=CONFIG.ui;
const PaintFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

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
  constructor(host) {
    this.host=host;this.hostId=crypto.randomUUID();this.entries=new Map();this.failed=false;this.ready=false;this.disposed=false;this.active=true;this.paused=false;this.starting=false;this.initialized=false;
    // These terrain tiles are already individual spatial batches. Copying the
    // entire 1.9 km field into two more buffers competes with combat draws for
    // resident memory. Both passes can draw the same indexed tiles as color.
    for(const mesh of host.battlefield.meshes)if(mesh.userData.deformableTerrain) {
      mesh.userData.noPrepassBatch=true;
      mesh.userData.noShadowBatch=true;
    }
    this.orderClock=0;this.lastBeat=null;this.music=null;this.lastStateSent=0;this.smoke=new Map();this.pendingActions=new Map();this.retiredMaterials=new DeferredMaterialDispose();this.warmedSignatures=new Set();
    let payload=null;
    try {payload=JSON.parse(sessionStorage.getItem(PAYLOAD_KEY)||"null");}catch{}
    const urlVariant=new URLSearchParams(globalThis.location?.search||"").get("variant");
    this.variant=CompileEncounterVariant(payload?.variantId||urlVariant||undefined);
    this.plan=new EncounterPlayPlan(payload?.document||this.variant.defaultDocument,payload?.time||0,this.variant);
    this.stealth=this.variant.stealthPlan?new VillageStealthPlay(host,new VillageStealthRules(this.variant.timeline)):null;
    this.noFireShots=0;this.noFireGrenades=0;this.noFireFailure=null;
    this.checkpointInventory=payload?.checkpointInventory||null;
    this.checkpointTime=null;
    this.templeEnteredAt=this.stealth&&this.plan.beat.id==="09b"?0:null;
    this.token=payload?.token||"standalone";
    this.puppets=new BlockoutPuppets({scene:host.scene,actorFactory:host.actorFactory,library:host.library,loadCast:LoadEncounterCast,
      groundAt:(x,z)=>this.variant.surfaceAt([x,z],this.sceneSignals||[])??host.battlefield.GroundHeight(x,z),formalOnly:true,asyncBlood:true,riggedPoseOnly:true,
      characterKeys:[...new Set([...Object.values(this.plan.config.casts).map(id=>XBOT_CAST_CHARACTERS[id]).filter(Boolean),...XBOT_FACTION_CHARACTERS.ija])]});
    this.view=new EncounterPlayView(host);
    this.puppets.xbot.view={camera:host.camera,renderer:host.renderer,post:host.post,lightRig:host.ctx.lights};
    this.BuildUi();
    this.api={State:()=>this.State(),SetLayout:n=>this.view.SetLayout(n),Interact:()=>this.Interact(),
      Actors:()=>this.Actors(),Presentation:()=>this.Presentation(),Retry:()=>this.Retry(),Begin:p=>this.Begin(p),Pause:on=>this.Pause(on),Suspend:()=>this.Suspend(),Stop:()=>this.RequestStop(),Dispose:()=>this.Dispose(),Ready:()=>this.readyPromise};
    this.readyPromise=this.Load().catch(error=>{this.error=String(error.stack||error);console.error(error);this.Send("error",{message:String(error.message||error)});});
  }
  BuildUi() {
    document.body.classList.add("encounterGame");
    this.style=document.createElement("link");this.style.rel="stylesheet";this.style.href=new URL("./Style_EncounterPlay.css?v=20261117SpeechBillboards",import.meta.url).href;document.head.append(this.style);
    this.speech=new EncounterPlayDialogue(this.host,this.view,id=>{
      const position=this.Position(id),soldier=this.entries.get(id)?.soldier;
      return position?{position,pose:soldier?.stance}:null;
    });
    this.onMessage=e=>{
      if(e.source!==window.parent||e.origin!==location.origin||e.data?.token!==this.token)return;
      if(e.data.type==="encounter-play-layout")this.view.SetLayout(e.data.count);
      if(e.data.type==="encounter-play-stop")this.Dispose();
    };
    window.addEventListener("message",this.onMessage);
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
    await Promise.all([this.puppets.xbot.Load(),PreloadDeathLibrary(),sfxWarm]);
    if(this.disposed)return;
    if(!this.puppets.xbot.ready)throw new Error("Character library could not load");
    this.castTexturesReady??=PrepareCastTextures(this.puppets.xbot.kits,(done,total)=>
      this.ReportStep(T("boot.step.encounterTextures",{done,total}),0.06+(done/total)*0.08));
    await this.castTexturesReady;
    this.ReportStep(T("boot.step.encounterDeaths"),0.16);
    const combatClipFiles=new Set([
      ...Object.values(XBOT_DEATHS).map(entry=>entry?.file),
      ...Object.values(XBOT_NATIVE).map(entry=>entry?.file),
      ...Object.values(XBOT_TURN_IN_PLACE).map(entry=>entry?.file),
      ...Object.values(XBOT_LOCOMOTION_4WAY).flatMap(group=>Object.values(group||{}).map(entry=>entry?.file)),
    ].filter(Boolean));
    const clipWarmups=await Promise.allSettled([...combatClipFiles].map(file=>this.puppets.xbot.Clip(file)));
    for(const result of clipWarmups)if(result.status==="rejected")console.warn("[EncounterPlay] Combat/death clip warmup failed; retaining fallback poses",result.reason);
    for(const key of ["fireStand","fireCrouch","fireProne"]) {
      const file=XBOT_NATIVE[key]?.file;
      if(file)this.puppets.xbot.AdditiveFireTracks?.(file);
    }
    if(this.disposed||!this.active)return;
    for(const key of this.puppets.xbot.characterKeys||[])if(!this.puppets.xbot.kits.has(key))throw new Error("正式人物模型加载失败："+key);
    this.ReportStep(T("boot.step.encounterActors"),0.2);
    await PaintFrame();
    if(this.disposed||!this.active)return;
    const cfg=this.plan.config;
    const frame=this.variant.evaluate(this.plan.time,this.plan.document);
    const p=frame.actors.find(a=>a.id==="player");
    this.host.player.Spawn(...p.p,EncounterPlayerYaw(this.plan.beat));
    this.SyncEnvironment(frame,true);
    if(this.host.Weapon()!==cfg.startWeapon)this.host.Pickup(cfg.startWeapon);
    this.host.state.clips=cfg.inventory.spareClips;
    if(this.host.state.mags.primary)this.host.state.mags.primary.clips=cfg.inventory.spareClips;
    this.host.state.grenades=cfg.inventory.grenades;this.host.state.bundles=cfg.inventory.bundles;
    this.RestoreCheckpointInventory();
    this.host.ctx.ApplyDebugOptions({reload:true});
    if(this.previousMissionCoverRules===undefined)this.previousMissionCoverRules=this.host.ai.missionCoverRules;
    this.host.ai.missionCoverRules=true;
    for(const actor of this.plan.initial)if(this.IsSoldier(actor))this.Spawn(actor,true);
    this.host.audio.SetToolsVolume?.(ToolsVolumeLevel(LoadToolsVolume(this.host.audio.masterVolume??1)));
    this.stealth?.Reset();
    this.noFireShots=this.host.state.playerShots;
    this.noFireGrenades=this.host.state.grenades+this.host.state.bundles;
    this.noFireFailure=null;
    this.initialized=true;this.ready=true;this.preparingPuppets=true;this.Update(0);
    this.puppets.Settle(40,.05,this.host.player.position);this.preparingPuppets=false;this.SetPlayerPuppetVisible(false);
    this.Send("ready");
  }
  async Begin(payload) {
    if(this.disposed)throw new Error("Play host disposed");
    if(this.active||this.ready||this.entries.size||this.pendingActions.size)this.Suspend();
    else this.view.SetLayout(1);
    this.starting=true;this.active=true;this.token=payload.token;
    const token=this.token;
    if(payload.variantId&&payload.variantId!==this.variant.id) {
      this.variant=CompileEncounterVariant(payload.variantId);
      this.stealth=this.variant.stealthPlan?new VillageStealthPlay(this.host,new VillageStealthRules(this.variant.timeline)):null;
    }
    this.plan=new EncounterPlayPlan(payload.document,payload.time,this.variant);
    this.templeEnteredAt=this.stealth&&this.plan.beat.id==="09b"?0:null;
    this.checkpointInventory=payload.checkpointInventory||null;this.checkpointTime=null;this.alarmAnnounced=false;
    this.failed=false;this.noFireFailure=null;this.error=null;this.hudKey=null;this.signalKey=null;this.lastBeat=null;this.lastStateSent=0;this.orderClock=0;this.music=null;
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
    this.host.ctx.RenderScene(0);this.Send("state",{state:this.State()});return true;
  }
  Pause(on=!this.paused) {
    if(!this.active||!this.ready||this.starting)return false;
    this.paused=!!on;this.host.state.running=!this.paused;
    this.host.audio.SetPaused(this.paused);
    if(this.paused){this.host.ctx.ReleasePointerLock();this.host.audio.ctx?.suspend();}
    else{this.host.ctx.menu?.Close();this.host.state.menu=false;this.host.audio.ctx?.resume();}
    this.Send("state",{state:this.State()});return this.paused;
  }
  Suspend() {
    if(this.previousEnvironmentObserverMode!==undefined) this.host.ctx.env.observerMode=this.previousEnvironmentObserverMode;
    if(this.previousMissionCoverRules!==undefined) this.host.ai.missionCoverRules=this.previousMissionCoverRules;
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
    this.speech.Clear();this.stealth?.Reset();this.noFireFailure=null;
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
    const signature=JSON.stringify([this.plan.startBeat.id,host.ctx.graphics,host.viewmodel.weaponId,
      [...this.entries.values()].map(e=>[e.actor.id,e.soldier.actor?.characterRig?.modelId,e.skin?.kit?.key,e.spec.weapon]),
      this.Presentation().map(p=>[p.id,p.kind,p.humans])]);
    const retained=this.warmedSignatures.has(signature);
    let bloodDrops=0,prepassBatchPrimed=0,shadowBatchPrimed=0,actorProgramsSubmitted=0,firstBatch=null;
    const excluded=new Set([...this.entries.values()].flatMap(entry=>entry.skin?.hidden||[]));
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
    host.scene.add(group);host.state.warming=true;
    const options={submitBatch:ENCOUNTER_PLAY_STARTUP.shaderSubmitBatch,
      drawBatch:ENCOUNTER_PLAY_STARTUP.shaderDrawBatch,revealBatch:ENCOUNTER_PLAY_STARTUP.meshRevealBatch,excluded,
      onFirstDraw:(ms,programs)=>{firstBatch={ms,programs};}};
    try {
      if(dimensions){
        const height=Math.min(post.height,ENCOUNTER_PLAY_STARTUP.warmupHeight);
        const width=Math.max(1,Math.round(height*post.width/post.height));
        post.SetSize(width,height,Math.round(width*post.outputWidth/post.width),Math.round(height*post.outputHeight/post.height));
      }
      host.scene.traverse(mesh=>{if(mesh.userData.hairGroom&&!mesh.visible){hiddenHair.push(mesh);mesh.visible=true;}});
      host.ai.PrepareCrowd(["nra","ija"]);
      PrepareWoundMaterials(host.scene);
      if(retained) {
        // These programs and action buffers already exist. A whole-scene
        // compile here also submits unused variants of the hidden actor rigs.
        host.ctx.RenderScene(0);
      } else {
        this.ReportStep(T("boot.step.encounterActorShaders"),0.24);
        await PaintFrame();
        actorProgramsSubmitted=SubmitEncounterActorPrograms(host);
        await host.ctx.WarmupShaders(host.scene,onStep,null,options);
        host.viewmodel.DrawActionWarmup(()=>host.ctx.RenderScene(0));
      }
    } catch(error) {
      this.error=String(error.stack||error);this.ready=false;this.Send("error",{message:String(error.message||error)});throw error;
    } finally {
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
    const DrawWarmFrame=()=>{
      host.ctx.StepFrames(1,ENCOUNTER_PLAY_STARTUP.settleDt,true);
      host.renderer.getContext().finish();
    };
    try{
      host.state.ready=true;host.state.warming=false;host.viewmodel.root.visible=true;
      this.ReportStep(T("boot.step.encounterWarmFrames",{done:1,total:ENCOUNTER_PLAY_STARTUP.settleFrames}),0.95);
      // Update the actual camera and blood distance-culling eye first.
      DrawWarmFrame();
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
        DrawWarmFrame();
      } finally {
        host.player.ads=prevAds;host.player.wantAds=prevWantAds;host.ctx.adsFovT=prevFovT;
      }
      for(let i=1;i<ENCOUNTER_PLAY_STARTUP.settleFrames;i++){
        this.ReportStep(T("boot.step.encounterWarmFrames",{done:i+1,total:ENCOUNTER_PLAY_STARTUP.settleFrames}),0.95+((i+1)/ENCOUNTER_PLAY_STARTUP.settleFrames)*0.05);
        DrawWarmFrame();
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
    camera.updateMatrixWorld();
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
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
    const soldier=this.host.ai.Spawn(spec.side,spec.x,spec.z,{weapon:spec.weapon,ry:spec.yawDeg*Math.PI/180,
      navPlacement:"authored",squadId:"Encounter_"+(actor.groupId||actor.id),modelVariant:variants[hash%variants.length],...SpeakingCastOptions(spec.castId)});
    if(!soldier)return false;
    const skin=spec.castId||spec.side==="ija"?this.puppets.xbot.Attach(soldier.actor,{faction:spec.side,castId:spec.castId,unitId:actor.id}):null;
    if(skin)this.host.ai.view.SetSkin(soldier,skin);
    const index=Number(actor.id.slice((actor.groupId||"").length+1))||0;
    const route=group&&["guard","suppress"].includes(group.behavior)?null:actor.route|| (group?GroupPath(group,index):null);
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
    const member=group?.memberPlans?.[index%(group?.maxAlive||1)];
    const deployment=(group?.deployDelay||0)+(member?.delay||0);
    const prior=initial?Math.max(0,this.plan.time-(group?.lives[index]?.born??this.plan.time)):0;
    const waitUntil=group?.id==="TempleSearch"?(this.templeEnteredAt??Infinity)+(member?.delay||0)
      :this.plan.elapsed+Math.max(0,deployment-prior);
    this.entries.set(actor.id,{actor,soldier,spec,skin,group,route,routeIndex,engaged:!!actor.firing||["shoot","melee"].includes(actor.pose),
      routeWaits:member?.waitSeconds||[],waitedIndex:-1,waitUntil});
    if(!initial)this.plan.Spawned(actor);
    return true;
  }
  AliveIds(){return new Set([...this.entries].filter(([,entry])=>entry.soldier.alive).map(([id])=>id));}
  Order(entry,frame) {
    const {soldier,group,route}=entry;
    const cfg=this.plan.config;
    const reachM=this.stealth&&entry.actor.id==="liu"&&["09a","09b"].includes(frame.beat.id)?0.18:cfg.routeReachM;
    if(!soldier.alive)return;
    const current=frame.actors.find(a=>a.id===entry.actor.id);
    if(group?.id==="TempleSearch"&&this.templeEnteredAt===null&&!this.stealth?.state?.alarm) {
      this.host.ai.DirectActor(soldier,{x:soldier.position.x,z:soldier.position.z,stance:1,combat:false,moving:false});
      return;
    }
    let target=group&&!route?[entry.spec.x,entry.spec.z]:current?.p||[soldier.position.x,soldier.position.z],moving=false;
    if(route) {
      const arrived=Math.hypot(soldier.position.x-route[entry.routeIndex][0],soldier.position.z-route[entry.routeIndex][1])<cfg.routeReachM;
      if(arrived&&entry.waitedIndex!==entry.routeIndex){
        entry.waitedIndex=entry.routeIndex;
        const boundWait=group?.behavior==="bounds"&&entry.routeIndex>0&&entry.routeIndex<route.length-1?(group.coverWaitSeconds??6.5):0;
        entry.waitUntil=Math.max(entry.waitUntil,this.plan.elapsed+(entry.routeWaits[entry.routeIndex]||boundWait));
      }
      if(arrived&&(this.plan.elapsed>=entry.waitUntil||this.stealth?.state?.alarm)&&entry.routeIndex<route.length-1)entry.routeIndex++;
      target=route[entry.routeIndex];
      if(this.plan.elapsed<entry.waitUntil&&!this.stealth?.state?.alarm)target=[soldier.position.x,soldier.position.z];
    }
    moving=Math.hypot(target[0]-soldier.position.x,target[1]-soldier.position.z)>reachM;
    entry.engaged ||= !!current?.firing||current?.pose==="shoot"||current?.pose==="melee";
    let combat=group?group.target!=="none"&&group.behavior!=="withdraw"&&this.plan.time>=group.engageAt:entry.engaged;
    if(this.stealth?.state?.alarm && entry.spec.side==="ija")combat=true;
    if(group?.suppressedBy?.some(id=>[...this.entries.values()].some(e=>e.actor.groupId===id&&e.soldier.alive&&e.soldier.targetVisible))) {
      if(group.suppressionStop)target=group.suppressionStop;
      moving=Math.hypot(target[0]-soldier.position.x,target[1]-soldier.position.z)>cfg.routeReachM;
    }
    let yaw=current?.heading===undefined?entry.spec.yawDeg*Math.PI/180:-current.heading;
    if(group?.afterRouteLookAt&&route&&entry.routeIndex===route.length-1&&!moving&&!combat) {
      yaw=Math.atan2(soldier.position.x-group.afterRouteLookAt[0],soldier.position.z-group.afterRouteLookAt[1]);
    }
    const guide=!!this.stealth&&entry.actor.id==="liu"&&frame.beat.id==="09a";
    const speed=guide?Math.max(2.6,Math.hypot(this.host.player.velocity.x,this.host.player.velocity.z)*1.15):group?.speed||2.6;
    if(guide&&moving)yaw=Math.atan2(soldier.position.x-target[0],soldier.position.z-target[1]);
    let forceYaw=false;
    if(this.stealth?.state?.suspicion>0 && entry.actor.id===this.stealth.observerId) {
      target=[soldier.position.x,soldier.position.z];moving=false;forceYaw=true;
      yaw=Math.atan2(-(this.host.player.position.x-soldier.position.x),-(this.host.player.position.z-soldier.position.z));
    }
    const allowCover=combat&&!guide&&!frame.stealth?.active;
    const authoredStance=guide&&speed>3.5?0:current?.pose==="prone"?2:current?.pose==="kneel"||current?.pose==="crouch"?1:0;
    this.host.ai.DirectActor(soldier,{x:target[0],z:target[1],yaw,forceYaw,
      stance:allowCover?null:authoredStance,
      combat,moving,speed,arrivalRadius:Math.min(reachM,0.7),
      allowCover,coverSlackM:allowCover?8.5:0,suppressible:allowCover});
  }
  Update(dt) {
    if(!this.active||this.paused||!this.ready||this.disposed)return;
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
      const brokeNoFire=before.stealth?.noFire&&(state.playerShots>this.noFireShots||totalGrenades<this.noFireGrenades);
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
    const frame=this.plan.Frame();
    this.SyncEnvironment(frame);
    this.SaveCheckpoint();
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
    this.sceneSignals=[...signals];
    const signalKey=[...signals].join(",");
    if(this.signalKey!==signalKey){
      this.signalKey=signalKey;
      const changed=this.host.battlefield.RestoreScenario?.({signalled:id=>signals.has(id)});
      if(changed)this.host.ctx.navGrid?.Refresh?.(this.host.battlefield,{spread:true});
    }
    for(const actor of frame.actors)if(this.IsSoldier(actor)&&!this.plan.groups.has(actor.groupId))this.Spawn(actor);
    for(const actor of this.plan.Spawns(alive))this.Spawn(actor);
    this.orderClock-=dt;
    if(this.orderClock<=0){for(const entry of this.entries.values())this.Order(entry,frame);this.orderClock=cfg.orderEveryS;}
    const units=frame.actors.filter(a=>a.id!=="player"&&!this.entries.has(a.id)&&!this.plan.groups.has(a.groupId)).map(a=>{
      const spec=EncounterActorSpec(a,frame.actors.find(parent=>parent.id===a.parentId),this.variant);
      if(a.side==="civilian"&&!spec.castId&&["person","child"].includes(a.kind))spec.castId=a.kind==="child"?"nier":"geng";
      if(a.kind==="litter")spec.kind="litter";
      return spec;
    });
    units.push({...EncounterActorSpec({id:"player",name:"",side:"player",kind:"person",p:[player.position.x,player.position.z],pose:"stand"},null,this.variant),
      yawDeg:player.yaw*180/Math.PI,stance:player.stance,state:"alive",visible:this.view.count===2||this.preparingPuppets===true,
      weapon:state.activeSlot==="melee"?"Dadao":this.host.Weapon()});
    this.puppets.SyncFrame(units,dt,this.view.count===2?null:player.position);
    this.playerPuppet=this.puppets.puppets.get("player");
    this.SetPlayerPuppetVisible(false);
    this.view.Update(id=>this.Position(id),dt);
    for(const actor of frame.actors)if(actor.kind==="tank"&&actor.pose==="burn"&&!this.smoke.has(actor.id)){
      const point=new THREE.Vector3(actor.p[0],this.host.battlefield.GroundHeight(...actor.p)+.7,actor.p[1]);
      this.smoke.set(actor.id,this.host.vfx.SmokeSource(point,{kind:"black",rate:7,life:5}));
    }
    const cue=this.failed||this.plan.completed?null:cfg.music[this.plan.beat.stage];
    if(cue!==this.music){this.music=cue;this.host.audio.Music(cue,{fadeOut:1.6,levelScale:0.7});}
    this.RenderHud(frame);
    if(this.plan.elapsed-this.lastStateSent>0.2||this.lastBeat!==this.plan.beat.id){
      this.lastStateSent=this.plan.elapsed;this.lastBeat=this.plan.beat.id;this.Send("state",{state:this.State()});
    }
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
    if(!this.active||this.paused||!this.ready||this.failed||this.plan.completed)return false;
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
      const pos=new THREE.Vector3(tank.p[0],this.host.battlefield.GroundHeight(...tank.p)+.2,tank.p[1]);
      const projectile=this.host.combat.Throw("GrenadeBundle",0,pos,new THREE.Vector3(0,-1,0),0,{handRelease:true});
      if(!projectile)return false;this.host.state.bundles--;this.pendingActions.set(id+"Destroyed",projectile);
    }
    if(action==="bandageWinter"){if(this.host.player.bandages<=0)return false;this.host.player.bandages--;}
    this.plan.Interact();
    return true;
  }
  OnKey(detail) {
    if(detail.code==="KeyR" && detail.down && !detail.repeat && this.failed)return this.Retry();
    if(this.stealth?.CapturesInput() && detail.down && !["Escape","KeyO"].includes(detail.code))return true;
    if(detail.code==="KeyO"&&this.view.count===2) {
      if(detail.down&&!detail.repeat) {
        if(this.view.focused){this.view.canvas.blur();this.host.Focus({fromClick:true});}
        else {this.host.ctx.ReleasePointerLock();this.view.mode="free";this.view.canvas.focus();}
      }
      return true;
    }
    if(detail.code==="KeyF"&&detail.down!==false&&this.plan.gate.action)return this.Interact();
  }
  RenderHud(frame=this.plan.Frame()) {
    const ui=this.plan.config.ui,reachM=this.plan.config.reachM;
    const stealthState=this.stealth?.state||null;
    const currentTask=this.stealth&&frame.beat.id==="09b"&&this.stealth.exitStartedElapsed!==null?ui.templeExit:this.plan.beat.task;
    const task=(stealthState?.active||frame.stealth?.noFire)?`${currentTask} · ${ui.stealthNoFire}`:currentTask;
    const title=this.plan.beat.id.toUpperCase()+" · "+this.plan.beat.title;
    const status=this.failed&&this.noFireFailure?this.noFireFailure
      :this.failed&&stealthState?.active?(stealthState.failure||ui.dead)
      :this.failed?ui.dead:stealthState?.alarm?ui.stealthAlarm:stealthState?.suspicion>0?ui.stealthSuspicion:this.plan.completed?ui.complete:task;
    const p=this.host.player.position,end=this.plan.gate.retreat&&this.plan.interacted.has(this.plan.beat.id)?this.plan.beat.p.at(-1):this.plan.Area().center,distance=Math.hypot(p.x-end[0],p.z-end[1]);
    const hint=this.failed&&(stealthState?.active||this.noFireFailure)?ui.stealthRetry:stealthState?.locked?ui.stealthPull:this.stealth&&frame.beat.id==="09b"&&distance<=reachM&&!this.PartyAtEndpoint()?ui.waitParty:stealthState?.active&&frame.beat.id==="09b"&&this.stealth.exitStartedElapsed===null?ui.stealthWait:this.failed?ui.retry:this.plan.completed?ui.stop:
      this.plan.CanInteract([p.x,p.z])?ui.interact:
      this.plan.waiting==="combat"?ui.clear:this.plan.waiting==="event"?ui.event:this.plan.waiting==="escort"?ui.escort:this.plan.waiting==="departure"?ui.departure:distance>reachM?ui.reach+" "+distance.toFixed(0)+" m":"";
    const dialogue=EncounterDialogueLines(this.plan,frame,{failed:this.failed,exit:!!(this.stealth&&this.stealth.exitStartedElapsed!==null),
      interact:this.plan.CanInteract([p.x,p.z])});
    this.speech.Set(frame,dialogue);
    const actions=this.host.hud.el?.actions?.textContent?.trim()||"";
    const notice=this.host.hud.el?.hint?.classList.contains("on")?this.host.hud.el.hint.textContent.trim():"";
    const help=(this.failed?[hint]:[hint,actions,notice]).filter(Boolean).join(" · ");
    const key=JSON.stringify([title,status,help,dialogue]);
    if(key===this.hudKey)return;this.hudKey=key;
    this.hudInfo={title,task:status,hint:help};
  }
  AfterRender(dt,options){
    this.view.Render(dt,options,()=>this.SetPlayerPuppetVisible(true),()=>this.SetPlayerPuppetVisible(false));
    this.speech.Render();
  }
  RequestStop(){if(window.parent!==window)this.Send("stop");else history.back();}
  Send(kind,extra={}){if(window.parent!==window)window.parent.postMessage({type:"encounter-play-"+kind,token:this.token,...extra},location.origin);}
  Actors(){return [...this.entries].map(([id,e])=>({id,soldierId:e.soldier.id,alive:e.soldier.alive,health:e.soldier.health,position:e.soldier.position.toArray(),model:e.skin?.kit?.key||e.soldier.actor?.characterRig?.modelId,group:e.actor.groupId||null}));}
  Presentation(){return [...this.puppets.puppets.values()].map(p=>({id:p.id,kind:p.unit.kind,stance:p.stance,
    model:p.body?.userData.model?.kind||(p.body?.userData.model?.tank?"tank":null),
    humans:p.humans.map(h=>h.skin?.kit?.key||h.actor.characterRig?.modelId||null)}));}
  State(){return {...this.plan.State(),hostId:this.hostId,active:this.active,paused:this.paused,starting:this.starting,initialized:this.initialized,ready:this.ready&&!this.starting,hints:this.hudInfo||{},dialogue:this.speech.State(),error:this.error||null,failed:this.failed,stealth:this.stealth?this.stealth.state:(this.plan.Frame().stealth||null),layout:this.view.count,view:this.view.State(),music:this.music,alive:this.AliveIds().size,actors:this.Actors(),signals:this.sceneSignals||[]};}
  CapturesInput() {
    return !this.active || this.paused || this.starting || !this.ready || this.failed || !!this.stealth?.CapturesInput()
      || (this.stealth?VillageStealthAt(this.plan.time,this.variant.timeline).locked:false)
      || this.view.count===2&&this.view.focused;
  }
  Fail() {
    this.failed=true;
    this.host.audio.Music(null,{fadeOut:0.2});
    this.RenderHud();this.Send("state",{state:this.State()});
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
  Retry() {
    if(!this.active || !this.ready || this.starting || this.disposed || !this.failed)return false;
    const plan=new EncounterPlayPlan(this.plan.document,this.checkpointTime??this.plan.beat.start,this.variant);
    const {player,state,combat,battlefield,vfx,ctx}=this.host;
    this.host.audio.ResetSession();
    ctx.gore?.ReleaseAll();ctx.meleeCombat?.Reset();
    this.host.interact.Clear();this.host.interact.ClearGroundWeapons();ctx.ClearLooseGuns();
    for(const entry of this.entries.values())this.host.ai.Remove(entry.soldier);
    this.entries.clear();
    this.host.ai.tactics.Reset();
    this.puppets.SyncFrame([],0);
    combat.ClearProjectiles();
    this.pendingActions.clear();
    battlefield.deformation?.Reset();
    vfx.ClearParticles();
    vfx.ClearGroundImpacts();
    for(const source of this.smoke.values())vfx.RemoveSmokeSource(source);
    this.smoke.clear();
    Object.assign(this,{
      plan,failed:false,noFireFailure:null,paused:false,alarmAnnounced:false,templeEnteredAt:this.stealth&&plan.beat.id==="09b"?0:null,
      orderClock:0,lastBeat:null,lastStateSent:-1,hudKey:null,signalKey:null,music:null
    });
    ctx.RespawnPlayer(true);
    const p=plan.Frame().player;
    player.Spawn(...p,EncounterPlayerYaw(plan.beat));
    this.RestoreCheckpointInventory();
    ctx.ApplyDebugOptions({reload:true});
    Object.assign(state,{playerAliveLast:true,pendingRespawn:false,deathTimer:0,cooking:null,cook:0,playerShots:0,lastShot:null,menu:false,running:true});
    ctx.ClearFirearmRequests();
    ctx.router.SetSuppressed(true);
    ctx.router.SetSuppressed(false);
    ctx.menu?.Close();this.host.hud.HideDeathCard?.();ctx.viewmodel.ResetDeath?.();
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
    this.Send("state",{state:this.State()});
    return true;
  }
  Dispose() {
    if(this.disposed)return;this.disposed=true;this.ready=false;
    this.host.audio.Music(null,{fadeOut:0});this.host.audio.Dispose();this.view.Dispose();
    for(const entry of this.entries.values())this.host.ai.Remove(entry.soldier);
    for(const id of this.smoke.values())this.host.vfx.RemoveSmokeSource(id);
    this.entries.clear();this.puppets.Dispose();window.removeEventListener("message",this.onMessage);
    this.retiredMaterials.Flush();
    this.speech.Dispose();this.style.remove();
    document.body.classList.remove("encounterGame");
  }
}
