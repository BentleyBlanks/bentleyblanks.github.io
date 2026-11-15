import * as THREE from "three";
import { EncounterPlayPlan, EncounterActorSpec, EncounterPlayerYaw, EncounterSceneSignals, ENCOUNTER_PLAY_CONFIG as CONFIG } from "./Script_EncounterPlayPlan.mjs";
import { EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT, BeatById } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import { GroupPath, ENCOUNTER_CINEMATICS } from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import { BlockoutPuppets } from "./Script_EditorBlockoutPuppets.mjs";
import { SpeakingCastOptions } from "./Script_FirstLevelSpeakingCast.mjs";
import { EncounterPlayView } from "./Script_EncounterPlayView.mjs";
import { LoadToolsVolume, ToolsVolumeLevel } from "./Script_EditorVolume.mjs";

const PAYLOAD_KEY="tengxian1938_encounter_play_session_v1";
const UI=CONFIG.ui;
export class EncounterPlay {
  constructor(host) {
    this.host=host;this.entries=new Map();this.failed=false;this.ready=false;this.disposed=false;
    this.orderClock=0;this.lastBeat=null;this.music=null;this.lastStateSent=0;this.smoke=new Map();
    let payload=null;
    try {payload=JSON.parse(sessionStorage.getItem(PAYLOAD_KEY)||"null");}catch{}
    this.plan=new EncounterPlayPlan(payload?.document||DEFAULT_ENCOUNTER_DOCUMENT,payload?.time||0);
    this.token=payload?.token||"standalone";
    this.puppets=new BlockoutPuppets({scene:host.scene,actorFactory:host.actorFactory,library:host.library,
      groundAt:(x,z)=>host.battlefield.GroundHeight(x,z),formalOnly:true});
    this.view=new EncounterPlayView(host);
    this.puppets.xbot.view={camera:host.camera,renderer:host.renderer,post:host.post,lightRig:host.ctx.lights};
    this.BuildUi();
    this.api={State:()=>this.State(),SetLayout:n=>this.view.SetLayout(n),Interact:()=>this.Interact(),
      Actors:()=>this.Actors(),Presentation:()=>this.Presentation(),Stop:()=>this.RequestStop(),Dispose:()=>this.Dispose(),Ready:()=>this.readyPromise};
    this.readyPromise=this.Load().catch(error=>{this.error=String(error.stack||error);this.status.textContent=UI.loadFailed;console.error(error);this.Send("error",{message:String(error.message||error)});});
  }
  BuildUi() {
    document.body.classList.add("encounterGame");
    this.style=document.createElement("link");this.style.rel="stylesheet";this.style.href=new URL("./Style_EncounterPlay.css",import.meta.url).href;document.head.append(this.style);
    this.panel=document.createElement("section");this.panel.className="encounterPlayHud";
    this.title=document.createElement("strong");this.status=document.createElement("div");
    this.dialogue=document.createElement("div");this.dialogue.className="encounterDialogue";
    this.hint=document.createElement("div");this.hint.className="encounterHint";
    this.stop=document.createElement("button");this.stop.textContent=UI.stop;this.stop.onclick=()=>this.RequestStop();
    this.panel.append(this.title,this.status,this.stop);document.body.append(this.panel,this.dialogue,this.hint);
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
    await this.puppets.xbot.Load();
    if(this.disposed)return;
    if(!this.puppets.xbot.ready)throw new Error("Character library could not load");
    const frame=EvaluateFlow(this.plan.time,this.plan.document);
    const p=frame.actors.find(a=>a.id==="player");
    this.host.player.Spawn(...p.p,EncounterPlayerYaw(this.plan.beat));
    if(this.host.Weapon()!==CONFIG.startWeapon)this.host.Pickup(CONFIG.startWeapon);
    this.host.state.clips=CONFIG.inventory.spareClips;
    if(this.host.state.mags.primary)this.host.state.mags.primary.clips=CONFIG.inventory.spareClips;
    this.host.state.grenades=CONFIG.inventory.grenades;this.host.state.bundles=CONFIG.inventory.bundles;
    this.host.player.SetDebugOptions({invincible:false,infiniteStamina:false});
    for(const actor of this.plan.initial)if(this.IsSoldier(actor))this.Spawn(actor,true);
    this.host.audio.SetToolsVolume?.(ToolsVolumeLevel(LoadToolsVolume(this.host.audio.masterVolume??1)));
    this.ready=true;this.Update(0);this.Send("ready");
  }
  IsSoldier(a){return a.id!=="player"&&a.kind==="person"&&["friend","enemy"].includes(a.side);}
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
    const soldier=this.host.ai.Spawn(spec.side,spec.x,spec.z,{weapon:spec.weapon,ry:spec.yawDeg*Math.PI/180,
      squadId:"Encounter_"+(actor.groupId||actor.id),...SpeakingCastOptions(spec.castId)});
    if(!soldier)return false;
    const skin=spec.castId||spec.side==="ija"?this.puppets.xbot.Attach(soldier.actor,{faction:spec.side,castId:spec.castId,unitId:actor.id}):null;
    if(skin)this.host.ai.view.SetSkin(soldier,skin);
    const index=Number(actor.id.slice((actor.groupId||"").length+1))||0;
    const route=actor.route|| (group?GroupPath(group,index):null);
    let routeIndex=0;
    if(route&&initial) {
      let nearest=Infinity;
      for(let i=0;i<route.length;i++){const d=Math.hypot(route[i][0]-spec.x,route[i][1]-spec.z);if(d<nearest){nearest=d;routeIndex=i;}}
    }
    this.entries.set(actor.id,{actor,soldier,spec,skin,group,route,routeIndex});
    if(!initial)this.plan.Spawned(actor);
    return true;
  }
  AliveIds(){return new Set([...this.entries].filter(([,entry])=>entry.soldier.alive).map(([id])=>id));}
  Order(entry,frame) {
    const {soldier,group,route}=entry;
    if(!soldier.alive)return;
    const current=frame.actors.find(a=>a.id===entry.actor.id);
    let target=current?.p||[soldier.position.x,soldier.position.z],moving=false;
    if(route) {
      while(entry.routeIndex<route.length-1&&Math.hypot(soldier.position.x-route[entry.routeIndex][0],soldier.position.z-route[entry.routeIndex][1])<CONFIG.routeReachM)entry.routeIndex++;
      target=route[entry.routeIndex];
    }
    moving=Math.hypot(target[0]-soldier.position.x,target[1]-soldier.position.z)>CONFIG.routeReachM;
    let combat=group?group.target!=="none"&&group.behavior!=="withdraw"&&this.plan.time>=group.engageAt:
      !!current?.firing||current?.pose==="shoot"||current?.pose==="melee";
    if(group?.suppressedBy?.some(id=>[...this.entries.values()].some(e=>e.actor.groupId===id&&e.soldier.alive&&e.soldier.targetVisible))) {
      if(group.suppressionStop)target=group.suppressionStop;
      moving=Math.hypot(target[0]-soldier.position.x,target[1]-soldier.position.z)>CONFIG.routeReachM;
    }
    this.host.ai.DirectActor(soldier,{x:target[0],z:target[1],yaw:entry.spec.yawDeg*Math.PI/180,
      stance:current?.pose==="prone"?2:current?.pose==="kneel"?1:0,combat,moving,speed:group?.speed||2.6});
  }
  Update(dt) {
    if(!this.ready||this.disposed)return;
    const {player,state}=this.host;
    for(const [id,entry] of this.entries)if(!entry.soldier.alive)this.plan.Kill(id);
    if(!player.Alive){this.failed=true;this.host.audio.Music(null,{fadeOut:0.2});this.RenderHud();return;}
    const alive=this.AliveIds();
    const previousBeat=this.plan.beat.id;
    this.plan.Step(dt,[player.position.x,player.position.z],alive);
    const frame=this.plan.Frame();
    if(previousBeat!==this.plan.beat.id&&ENCOUNTER_CINEMATICS.includes(this.plan.beat.id)) {
      const p=this.plan.beat.p[0];player.position.set(p[0],this.host.battlefield.GroundHeight(...p),p[1]);
      player.body?.Teleport(player.position.x,player.position.y,player.position.z);
    }
    const signals=EncounterSceneSignals(frame);signals.add("Stage0105Done");
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
    const units=frame.actors.filter(a=>a.id!=="player"&&!this.entries.has(a.id)).map(a=>{
      const spec=EncounterActorSpec(a);
      if(a.side==="civilian"&&!spec.castId&&["person","child"].includes(a.kind))spec.castId=a.kind==="child"?"nier":"geng";
      if(a.kind==="litter")spec.kind="litter";
      return spec;
    });
    units.push({...EncounterActorSpec({id:"player",name:"",side:"player",kind:"person",p:[player.position.x,player.position.z],pose:"stand"}),
      yawDeg:player.yaw*180/Math.PI,stance:["stand","crouch","prone"][player.stance]||"stand",state:"alive",weapon:state.activeSlot==="melee"?"Dadao":this.host.Weapon()});
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
  SetPlayerPuppetVisible(visible){for(const human of this.playerPuppet?.humans||[])human.actor.root.visible=visible;}
  Position(id) {
    if(id==="player")return this.host.player.position;
    const entry=this.entries.get(id);if(entry)return entry.soldier.position;
    const puppet=this.puppets.puppets.get(id);
    return puppet?new THREE.Vector3(puppet.x,this.host.battlefield.GroundHeight(puppet.x,puppet.z),puppet.z):null;
  }
  Interact() {
    if(!this.ready||this.failed||this.plan.completed)return false;
    const end=this.plan.beat.p.at(-1),p=this.host.player.position;
    if(Math.hypot(p.x-end[0],p.z-end[1])>CONFIG.reachM)return false;
    this.plan.Interact();
    return true;
  }
  OnKey(detail) {
    if(detail.code==="KeyO"&&this.view.count===2) {
      if(detail.down&&!detail.repeat) {
        if(this.view.focused){this.view.canvas.blur();this.host.Focus({fromClick:true});}
        else {this.host.ctx.ReleasePointerLock();this.view.mode="free";this.view.canvas.focus();}
      }
      return true;
    }
    if(detail.code==="KeyF"&&detail.down!==false&&CONFIG.interactionBeats.includes(this.plan.beat.id))return this.Interact();
  }
  RenderHud(frame=this.plan.Frame()) {
    const title=this.plan.beat.id.toUpperCase()+" · "+this.plan.beat.title;
    const status=this.failed?UI.dead:this.plan.completed?UI.complete:this.plan.beat.task;
    const p=this.host.player.position,end=this.plan.beat.p.at(-1),distance=Math.hypot(p.x-end[0],p.z-end[1]);
    const hint=this.failed?UI.retry:this.plan.completed?UI.stop:
      CONFIG.interactionBeats.includes(this.plan.beat.id)&&distance<CONFIG.reachM?UI.interact:
      this.plan.waiting==="combat"?UI.clear:distance>CONFIG.reachM?UI.reach+" "+distance.toFixed(0)+" m":"";
    const dialogue=frame.dialogue.filter(line=>!this.plan.dead.has(line.actorId));
    const key=JSON.stringify([title,status,hint,dialogue]);
    if(key===this.hudKey)return;this.hudKey=key;
    this.title.textContent=title;this.status.textContent=status;this.hint.textContent=hint;
    this.dialogue.replaceChildren();
    for(const line of dialogue) {
      const row=document.createElement("p");row.textContent=line.name+"："+line.text;this.dialogue.append(row);
    }
    this.dialogue.hidden=!this.dialogue.childElementCount;
  }
  AfterRender(dt,options){this.view.Render(dt,options,()=>this.SetPlayerPuppetVisible(true),()=>this.SetPlayerPuppetVisible(false));}
  RequestStop(){if(window.parent!==window)this.Send("stop");else history.back();}
  Send(kind,extra={}){if(window.parent!==window)window.parent.postMessage({type:"encounter-play-"+kind,token:this.token,...extra},location.origin);}
  Actors(){return [...this.entries].map(([id,e])=>({id,alive:e.soldier.alive,health:e.soldier.health,position:e.soldier.position.toArray(),model:e.skin?.kit?.key||e.soldier.actor.characterRig?.modelId,group:e.actor.groupId||null}));}
  Presentation(){return [...this.puppets.puppets.values()].map(p=>({id:p.id,kind:p.unit.kind,stance:p.stance,
    model:p.body?.userData.model?.kind||(p.body?.userData.model?.tank?"tank":null),
    humans:p.humans.map(h=>h.skin?.kit?.key||h.actor.characterRig?.modelId||null)}));}
  State(){return {...this.plan.State(),ready:this.ready,error:this.error||null,failed:this.failed,layout:this.view.count,view:this.view.State(),music:this.music,alive:this.AliveIds().size,actors:this.Actors()};}
  Dispose() {
    if(this.disposed)return;this.disposed=true;this.ready=false;
    this.host.audio.Music(null,{fadeOut:0});this.host.audio.Dispose();this.view.Dispose();
    for(const entry of this.entries.values())this.host.ai.Remove(entry.soldier);
    for(const id of this.smoke.values())this.host.vfx.RemoveSmokeSource(id);
    this.entries.clear();this.puppets.Dispose();window.removeEventListener("message",this.onMessage);
    for(const node of [this.panel,this.dialogue,this.hint,this.style])node.remove();
    document.body.classList.remove("encounterGame");
  }
}
