import * as THREE from "three";
import { EncounterPlayPlan, EncounterCanPlay, EncounterActorSpec, EncounterPlayerYaw, EncounterSceneSignals, ENCOUNTER_PLAY_CONFIG as CONFIG } from "./Script_EncounterPlayPlan.mjs";
import { EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT, BeatById, FLOW_TIMELINE } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import { VillageStealthRules, VillageStealthAt, StageVillageCompanions } from "./Scenes/FirstLevelEncounter/Script_LevelFlowVillage.mjs";
import { SampleBeatRoute } from "./Scenes/FirstLevelEncounter/Script_LevelFlowGeometry.mjs";
import { VillageStealthPlay } from "./Script_VillageStealthPlay.mjs";
import { GroupPath, ENCOUNTER_CINEMATICS } from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
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
import { XBOT_DEATHS } from "./Data_BlockoutXBotClips.mjs";
import { BeishaheSurfaceAt } from "./Scenes/FirstLevelEncounter/Script_LevelFlowBeishahe.mjs";
import { PreloadDeathLibrary } from "./Script_HitReactionLayer.mjs";

const PAYLOAD_KEY="tengxian1938_encounter_play_session_v1";
const UI=CONFIG.ui;
export class EncounterPlay {
  constructor(host) {
    this.host=host;this.hostId=crypto.randomUUID();this.entries=new Map();this.failed=false;this.ready=false;this.disposed=false;this.active=true;this.paused=false;this.starting=false;this.initialized=false;
    this.orderClock=0;this.lastBeat=null;this.music=null;this.lastStateSent=0;this.smoke=new Map();this.pendingActions=new Map();this.retiredMaterials=new DeferredMaterialDispose();this.warmedSignatures=new Set();
    let payload=null;
    try {payload=JSON.parse(sessionStorage.getItem(PAYLOAD_KEY)||"null");}catch{}
    this.plan=new EncounterPlayPlan(payload?.document||DEFAULT_ENCOUNTER_DOCUMENT,payload?.time||0);
    this.stealth=new VillageStealthPlay(host,new VillageStealthRules(FLOW_TIMELINE));
    this.checkpointInventory=payload?.checkpointInventory||null;
    this.checkpointTime=null;
    this.templeEnteredAt=this.plan.beat.id==="09b"?0:null;
    this.token=payload?.token||"standalone";
    this.puppets=new BlockoutPuppets({scene:host.scene,actorFactory:host.actorFactory,library:host.library,
      groundAt:(x,z)=>BeishaheSurfaceAt([x,z],this.sceneSignals||[])??host.battlefield.GroundHeight(x,z),formalOnly:true,asyncBlood:true,riggedPoseOnly:true,
      characterKeys:[...new Set([...Object.values(CONFIG.casts).map(id=>XBOT_CAST_CHARACTERS[id]).filter(Boolean),...XBOT_FACTION_CHARACTERS.ija])]});
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
  async Load() {
    const phase=this.host.ctx.PHASE_TABLE[this.host.state.phaseIndex];
    if(phase.blockout?.sceneError)throw new Error(phase.blockout.sceneError);
    await Promise.all([this.puppets.xbot.Load(),PreloadDeathLibrary()]);
    if(this.disposed)return;
    if(!this.puppets.xbot.ready)throw new Error("Character library could not load");
    const deaths=await Promise.allSettled(Object.values(XBOT_DEATHS).map(entry=>this.puppets.xbot.Clip(entry.file)));
    for(const result of deaths)if(result.status==="rejected")console.warn("[EncounterPlay] Death clip warmup failed; retaining mirrored poses",result.reason);
    if(this.disposed||!this.active)return;
    for(const key of this.puppets.xbot.characterKeys||[])if(!this.puppets.xbot.kits.has(key))throw new Error("正式人物模型加载失败："+key);
    const frame=EvaluateFlow(this.plan.time,this.plan.document);
    const p=frame.actors.find(a=>a.id==="player");
    this.host.player.Spawn(...p.p,EncounterPlayerYaw(this.plan.beat));
    this.SyncEnvironment(frame,true);
    if(this.host.Weapon()!==CONFIG.startWeapon)this.host.Pickup(CONFIG.startWeapon);
    this.host.state.clips=CONFIG.inventory.spareClips;
    if(this.host.state.mags.primary)this.host.state.mags.primary.clips=CONFIG.inventory.spareClips;
    this.host.state.grenades=CONFIG.inventory.grenades;this.host.state.bundles=CONFIG.inventory.bundles;
    this.RestoreCheckpointInventory();
    this.host.ctx.ApplyDebugOptions({reload:true});
    for(const actor of this.plan.initial)if(this.IsSoldier(actor))this.Spawn(actor,true);
    this.host.audio.SetToolsVolume?.(ToolsVolumeLevel(LoadToolsVolume(this.host.audio.masterVolume??1)));
    this.stealth.Reset();
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
    this.plan=new EncounterPlayPlan(payload.document,payload.time);
    this.templeEnteredAt=this.plan.beat.id==="09b"?0:null;
    this.checkpointInventory=payload.checkpointInventory||null;this.checkpointTime=null;this.alarmAnnounced=false;
    this.failed=false;this.error=null;this.hudKey=null;this.signalKey=null;this.lastBeat=null;this.lastStateSent=0;this.orderClock=0;this.music=null;
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
    this.speech.Clear();this.stealth.Reset();
  }
  IsSoldier(a){return a.id!=="player"&&a.kind==="person"&&["friend","enemy"].includes(a.side);}
  SyncEnvironment(frame,snap=false) {
    const {env,envBridge}=this.host.ctx;
    if(!env?.active)return;
    const config=CONFIG.environment;
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
    const signature=JSON.stringify([this.plan.startBeat.id,host.ctx.graphics,
      [...this.entries.values()].map(e=>[e.actor.id,e.soldier.actor?.characterRig?.modelId,e.skin?.kit?.key,e.spec.weapon]),
      this.Presentation().map(p=>[p.id,p.kind,p.humans])]);
    const retained=this.warmedSignatures.has(signature);
    let bloodDrops=0,prepassBatchPrimed=0,shadowBatchPrimed=0;
    const excluded=new Set([...this.entries.values()].flatMap(entry=>entry.skin?.hidden||[]));
    const post=host.post;
    const dimensions=retained?null:[post.width,post.height,post.outputWidth,post.outputHeight];
    const hiddenHair=[];
    const group=new THREE.Group();group.name="EncounterWarmExtras";
    AddGoreWarmProxies(group,[...this.entries.values()].map(e=>e.soldier.actor));
    if(host.viewmodel.CreateActionDebrisWarmProxy)group.add(host.viewmodel.CreateActionDebrisWarmProxy());
    host.scene.add(group);host.state.warming=true;
    const options={submitBatch:ENCOUNTER_PLAY_STARTUP.shaderSubmitBatch,
      drawBatch:ENCOUNTER_PLAY_STARTUP.shaderDrawBatch,revealBatch:ENCOUNTER_PLAY_STARTUP.meshRevealBatch,excluded};
    try {
      if(dimensions){
        const height=Math.min(post.height,ENCOUNTER_PLAY_STARTUP.warmupHeight);
        const width=Math.max(1,Math.round(height*post.width/post.height));
        post.SetSize(width,height,Math.round(width*post.outputWidth/post.width),Math.round(height*post.outputHeight/post.height));
      }
      host.scene.traverse(mesh=>{if(mesh.userData.hairGroom&&!mesh.visible){hiddenHair.push(mesh);mesh.visible=true;}});
      host.ai.PrepareCrowd(["nra","ija"]);
      if(!retained)PrepareWoundMaterials(host.scene);
      if(retained)host.ctx.CompileAsRendered(host.scene);
      else await host.ctx.WarmupShaders(host.scene,onStep,null,options);
      if(retained)host.ctx.RenderScene(0);
    } catch(error) {
      this.error=String(error.stack||error);this.ready=false;this.Send("error",{message:String(error.message||error)});throw error;
    } finally {
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
    if(!retained){
      await post.dofPass.Warmup();
      await host.vfx.particles.Ready();
      const blood=host.vfx.bloodEffects;
      const ready=host.state.ready;
      const warming=host.state.warming;
      const DrawWarmFrame=()=>{
        host.ctx.StepFrames(1,ENCOUNTER_PLAY_STARTUP.settleDt,true);
        host.renderer.getContext().finish();
      };
      try{
        host.state.ready=true;host.state.warming=false;
        // Update the actual camera and blood distance-culling eye first.
        DrawWarmFrame();
        // Encounter's dedicated warmup bypasses WarmLevel's static-batch Prime.
        // Otherwise the 30-frame settling threshold allocates/uploads the entire
        // terrain batch during the first fight (about 270 MB on this scene).
        // The following warm draws and finish complete it behind the loading UI.
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
        for(let i=1;i<ENCOUNTER_PLAY_STARTUP.settleFrames;i++)DrawWarmFrame();
      }finally{
        host.state.ready=ready;host.state.warming=warming;blood.mist.Clear();blood.drops.Clear();blood.Clear();
        post.NotifyCameraCut();
      }
    }
    host.state.actorShaderWarm={mode:retained?"retainedPrograms":"activeScene",ms:performance.now()-start,programs:host.renderer.info.programs.length,bloodDrops,prepassBatchPrimed,shadowBatchPrimed};
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
    const spec=EncounterActorSpec(actor),group=actor.group||this.plan.compiled.groups.find(g=>g.id===actor.groupId);
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
    const reachM=entry.actor.id==="liu"&&["09a","09b"].includes(frame.beat.id)?0.18:CONFIG.routeReachM;
    if(!soldier.alive)return;
    const current=frame.actors.find(a=>a.id===entry.actor.id);
    if(group?.id==="TempleSearch"&&this.templeEnteredAt===null&&!this.stealth.state?.alarm) {
      this.host.ai.DirectActor(soldier,{x:soldier.position.x,z:soldier.position.z,stance:1,combat:false,moving:false});
      return;
    }
    let target=group&&!route?[entry.spec.x,entry.spec.z]:current?.p||[soldier.position.x,soldier.position.z],moving=false;
    if(route) {
      const arrived=Math.hypot(soldier.position.x-route[entry.routeIndex][0],soldier.position.z-route[entry.routeIndex][1])<CONFIG.routeReachM;
      if(arrived&&entry.waitedIndex!==entry.routeIndex){
        entry.waitedIndex=entry.routeIndex;
        entry.waitUntil=Math.max(entry.waitUntil,this.plan.elapsed+(entry.routeWaits[entry.routeIndex]||0));
      }
      if(arrived&&(this.plan.elapsed>=entry.waitUntil||this.stealth.state?.alarm)&&entry.routeIndex<route.length-1)entry.routeIndex++;
      target=route[entry.routeIndex];
      if(this.plan.elapsed<entry.waitUntil&&!this.stealth.state?.alarm)target=[soldier.position.x,soldier.position.z];
    }
    moving=Math.hypot(target[0]-soldier.position.x,target[1]-soldier.position.z)>reachM;
    entry.engaged ||= !!current?.firing||current?.pose==="shoot"||current?.pose==="melee";
    let combat=group?group.target!=="none"&&group.behavior!=="withdraw"&&this.plan.time>=group.engageAt:entry.engaged;
    if(this.stealth.state?.alarm && entry.spec.side==="ija")combat=true;
    if(group?.suppressedBy?.some(id=>[...this.entries.values()].some(e=>e.actor.groupId===id&&e.soldier.alive&&e.soldier.targetVisible))) {
      if(group.suppressionStop)target=group.suppressionStop;
      moving=Math.hypot(target[0]-soldier.position.x,target[1]-soldier.position.z)>CONFIG.routeReachM;
    }
    let yaw=current?.heading===undefined?entry.spec.yawDeg*Math.PI/180:-current.heading;
    if(group?.afterRouteLookAt&&route&&entry.routeIndex===route.length-1&&!moving&&!combat) {
      yaw=Math.atan2(soldier.position.x-group.afterRouteLookAt[0],soldier.position.z-group.afterRouteLookAt[1]);
    }
    const guide=entry.actor.id==="liu"&&frame.beat.id==="09a";
    const speed=guide?Math.max(2.6,Math.hypot(this.host.player.velocity.x,this.host.player.velocity.z)*1.15):group?.speed||2.6;
    if(guide&&moving)yaw=Math.atan2(soldier.position.x-target[0],soldier.position.z-target[1]);
    if(this.stealth.state?.suspicion>0 && entry.actor.id===this.stealth.observerId) {
      target=[soldier.position.x,soldier.position.z];moving=false;
      yaw=Math.atan2(-(this.host.player.position.x-soldier.position.x),-(this.host.player.position.z-soldier.position.z));
    }
    this.host.ai.DirectActor(soldier,{x:target[0],z:target[1],yaw,
      stance:guide&&speed>3.5?0:current?.pose==="prone"?2:current?.pose==="kneel"?1:0,
      combat,moving,speed,arrivalRadius:Math.min(reachM,0.7)});
  }
  Update(dt) {
    if(!this.active||this.paused||!this.ready||this.disposed)return;
    if(this.failed){this.RenderHud();return;}
    const {player,state}=this.host;
    for(const [id,entry] of this.entries)if(!entry.soldier.alive)this.plan.Kill(id);
    if(!player.Alive){this.Fail();return;}
    const alive=this.AliveIds();
    const before=this.plan.Frame();
    const stealth=this.stealth.Update(before,dt,this.entries);
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
      if(this.plan.groups.get(group.id).count>=group.count&&entries.every(e=>!e.soldier.alive||e.route&&e.routeIndex===e.route.length-1&&Math.hypot(e.soldier.position.x-e.route.at(-1)[0],e.soldier.position.z-e.route.at(-1)[1])<CONFIG.routeReachM))departed.push(group.id);
    }
    const escorted=[...this.puppets.puppets.values()].filter(p=>/^stretcher\d+$/.test(p.id)&&p.z>=CONFIG.escortExitZ).length;
    const facts=[];for(const [fact,p] of this.pendingActions)if(!p.alive){facts.push(fact);this.pendingActions.delete(fact);}
    if(!stealth.alarm)this.plan.Step(dt,[player.position.x,player.position.z],alive,{departed,escorted,facts,partyArrived:this.PartyAtEndpoint()});
    const frame=this.plan.Frame();
    this.SyncEnvironment(frame);
    this.SaveCheckpoint();
    if(previousBeat!==frame.beat.id&&frame.beat.id==="09b") {
      this.templeEnteredAt=this.plan.elapsed;
      for(const entry of this.entries.values())if(entry.actor.groupId==="TempleSearch") {
        const index=Number(entry.actor.id.split("_").at(-1));
        entry.waitUntil=this.templeEnteredAt+(entry.group.memberPlans?.[index]?.delay||0);
        entry.waitedIndex=-1;
      }
    }
    const companionTime=this.stealth.CompanionFrameTime(frame,this.entries,this.plan.elapsed);
    if(companionTime!==null) {
      const companions=["player","liu","nier"].map(id=>{
        const actor=frame.actors.find(a=>a.id===id);
        return {id,p:[...actor.p],pose:actor.pose};
      });
      companions[0].p=SampleBeatRoute(frame.beat,(companionTime-frame.beat.start)/frame.beat.duration);
      StageVillageCompanions(companions,companionTime,FLOW_TIMELINE);
      for(const source of companions.slice(1)) {
        const actor=frame.actors.find(a=>a.id===source.id);
        Object.assign(actor,{p:source.p,pose:source.pose,heading:source.heading,status:source.status});
      }
    }
    const signals=EncounterSceneSignals(frame,this.plan.facts);signals.add("Stage0105Done");
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
    if(this.orderClock<=0){for(const entry of this.entries.values())this.Order(entry,frame);this.orderClock=CONFIG.orderEveryS;}
    const units=frame.actors.filter(a=>a.id!=="player"&&!this.entries.has(a.id)&&!this.plan.groups.has(a.groupId)).map(a=>{
      const spec=EncounterActorSpec(a,frame.actors.find(parent=>parent.id===a.parentId));
      if(a.side==="civilian"&&!spec.castId&&["person","child"].includes(a.kind))spec.castId=a.kind==="child"?"nier":"geng";
      if(a.kind==="litter")spec.kind="litter";
      return spec;
    });
    units.push({...EncounterActorSpec({id:"player",name:"",side:"player",kind:"person",p:[player.position.x,player.position.z],pose:"stand"}),
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
    const cue=this.failed||this.plan.completed?null:CONFIG.music[this.plan.beat.stage];
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
    if(this.plan.beat.id!=="09b")return false;
    const end=this.plan.beat.p.at(-1);
    return ["liu","nier"].every(id=>{
      if(this.plan.dead.has(id))return true;
      const position=this.Position(id);
      return position&&Math.hypot(position.x-end[0],position.z-end[1])<CONFIG.reachM;
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
    if(this.stealth.CapturesInput() && detail.down && !["Escape","KeyO"].includes(detail.code))return true;
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
    const currentTask=frame.beat.id==="09b"&&this.stealth.exitStartedElapsed!==null?UI.templeExit:this.plan.beat.task;
    const task=this.stealth.state?.active?`${currentTask} · ${UI.stealthNoFire}`:currentTask;
    const title=this.plan.beat.id.toUpperCase()+" · "+this.plan.beat.title;
    const status=this.failed && this.stealth.state?.active ? (this.stealth.state.failure||UI.dead)
      : this.failed?UI.dead:this.stealth.state?.alarm?UI.stealthAlarm:this.stealth.state?.suspicion>0?UI.stealthSuspicion:this.plan.completed?UI.complete:task;
    const p=this.host.player.position,end=this.plan.gate.retreat&&this.plan.interacted.has(this.plan.beat.id)?this.plan.beat.p.at(-1):this.plan.Area().center,distance=Math.hypot(p.x-end[0],p.z-end[1]);
    const hint=this.failed&&this.stealth.state?.active?UI.stealthRetry:this.stealth.state?.locked?UI.stealthPull:frame.beat.id==="09b"&&distance<=CONFIG.reachM&&!this.PartyAtEndpoint()?UI.waitParty:this.stealth.state?.active&&frame.beat.id==="09b"&&this.stealth.exitStartedElapsed===null?UI.stealthWait:this.failed?UI.retry:this.plan.completed?UI.stop:
      this.plan.CanInteract([p.x,p.z])?UI.interact:
      this.plan.waiting==="combat"?UI.clear:this.plan.waiting==="event"?UI.event:this.plan.waiting==="escort"?UI.escort:this.plan.waiting==="departure"?UI.departure:distance>CONFIG.reachM?UI.reach+" "+distance.toFixed(0)+" m":"";
    const dialogue=EncounterDialogueLines(this.plan,frame,{failed:this.failed,exit:this.stealth.exitStartedElapsed!==null,
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
  State(){return {...this.plan.State(),hostId:this.hostId,active:this.active,paused:this.paused,starting:this.starting,initialized:this.initialized,ready:this.ready&&!this.starting,hints:this.hudInfo||{},dialogue:this.speech.State(),error:this.error||null,failed:this.failed,stealth:this.stealth.state,layout:this.view.count,view:this.view.State(),music:this.music,alive:this.AliveIds().size,actors:this.Actors(),signals:this.sceneSignals||[]};}
  CapturesInput() {
    return !this.active || this.paused || this.starting || !this.ready || this.failed || this.stealth.CapturesInput()
      || VillageStealthAt(this.plan.time,FLOW_TIMELINE).locked
      || this.view.count===2&&this.view.focused;
  }
  Fail() {
    this.failed=true;
    this.host.audio.Music(null,{fadeOut:0.2});
    this.RenderHud();this.Send("state",{state:this.State()});
    return true;
  }
  SaveCheckpoint() {
    const stealth=VillageStealthAt(this.plan.time,FLOW_TIMELINE);
    const desiredTime=stealth.active?stealth.checkpoint:this.plan.beat.start;
    if(this.checkpointTime===desiredTime)return;
    // The approach checkpoint can reference a skipped cinematic (08F).
    const time=FLOW_TIMELINE.find(beat=>beat.start>=desiredTime&&EncounterCanPlay(beat.start)).start;
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
    const plan=new EncounterPlayPlan(this.plan.document,this.checkpointTime??this.plan.beat.start);
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
      plan,failed:false,paused:false,alarmAnnounced:false,templeEnteredAt:plan.beat.id==="09b"?0:null,
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
    this.stealth.Reset();
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
