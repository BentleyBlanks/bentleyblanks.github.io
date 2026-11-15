import { FLOW_TIMELINE, EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT, BeatById, Distance } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import { CompileEncounters, ValidateEncounterDocument, GroupPath, ENCOUNTER_CINEMATICS } from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import { InsideArea } from "./Scenes/FirstLevelEncounter/Script_LevelFlowGeometry.mjs";
import { ENCOUNTER_PLAY as CONFIG } from "./Scenes/FirstLevelEncounter/Data_Play.mjs";

export { CONFIG as ENCOUNTER_PLAY_CONFIG };
export function EncounterSceneSignals(frame) {
  return new Set(CONFIG.signals.filter(s=>s.beat?frame.beat.id>=s.beat:frame.time>=s.time).map(s=>s.id));
}
export function EncounterStartBeat(time=0) {
  return FLOW_TIMELINE.find(b=>time<b.end)||FLOW_TIMELINE.at(-1);
}
export function EncounterPlayerYaw(beat) {
  const from=beat.p[0],to=beat.p.find(p=>Distance(p,from)>.1);
  return to?Math.atan2(from[0]-to[0],from[1]-to[1]):Math.PI/2;
}
export function EncounterActorSpec(actor,carrier=null) {
  const civilian=actor.side==="civilian", castId=CONFIG.casts[actor.id]||null;
  const next={id:actor.id,name:actor.name,castId,side:actor.side==="enemy"?"ija":civilian?"civ":"nra",
    x:actor.p[0],z:actor.p[1],yawDeg:-(actor.heading||0)*180/Math.PI,
    stance:["prone","wounded","dead","down"].includes(actor.pose)?"prone":["kneel","crouch"].includes(actor.pose)?"crouch":"stand",
    state:["dead","wounded","down"].includes(actor.pose)?"down":"alive",aim:!!actor.firing||actor.pose==="shoot",
    kind:actor.kind==="tank"?"tank":actor.kind==="cart"?"cart":actor.kind==="donkey"?"animal":actor.kind==="child"?"child":actor.kind==="quilt"?"soldier":civilian?"civilian":"soldier",
    weapon:civilian||actor.id==="winter"?null:actor.side==="enemy"?(actor.heavy?"Type11":"Type38"):(actor.heavy?"Zb26":"HanYang"),
    shape:"tankette",...(actor.kind==="cart"?{animal:false}:{})};
  if(actor.parentId&&carrier) {
    const yaw=-(carrier.heading||0),c=Math.cos(yaw),s=Math.sin(yaw),dx=actor.p[0]-carrier.p[0],dz=actor.p[1]-carrier.p[1];
    next.ride={on:carrier.id,x:c*dx-s*dz,z:s*dx+c*dz,y:actor.elevation||0,yawDeg:next.yawDeg-yaw*180/Math.PI};
    if(next.state==="down")next.lie="along";
  }
  return next;
}

// Authored time is a director clock. Gameplay facts, not preview lifetimes,
// decide deaths, area triggers and reinforcement slots after the chosen keyframe.
export class EncounterPlayPlan {
  constructor(document=DEFAULT_ENCOUNTER_DOCUMENT,time=0) {
    this.document=ValidateEncounterDocument(structuredClone(document),FLOW_TIMELINE);
    this.startBeat=EncounterStartBeat(time);
    this.time=this.startBeat.start;this.elapsed=0;this.beatIndex=FLOW_TIMELINE.indexOf(this.startBeat);
    this.compiled=CompileEncounters(this.document,FLOW_TIMELINE);
    this.dead=new Set();this.spawned=new Set();this.triggers=new Map();this.groups=new Map();
    this.interacted=new Set();this.completed=false;this.waiting=null;
    const snapshot=EvaluateFlow(this.time,this.document);
    for(const actor of snapshot.actors) if(actor.pose==="dead") this.dead.add(actor.id);
    for(const trigger of this.compiled.triggers) if(trigger.firedAt!==null&&trigger.firedAt<=this.time) this.triggers.set(trigger.id,trigger.firedAt);
    for(const group of this.compiled.groups) {
      const expired=group.lives.filter(l=>l.fall<=this.time).length;
      const prior=group.lives.filter(l=>l.born<=this.time).length;
      this.groups.set(group.id,{count:prior,lastSpawn:-Infinity});
      for(let i=0;i<expired;i++) this.dead.add(group.id+"_"+i);
      for(let i=0;i<prior;i++) this.spawned.add(group.id+"_"+i);
    }
    this.initial=snapshot.actors.filter(a=>!this.dead.has(a.id));
  }
  get beat(){return FLOW_TIMELINE[this.beatIndex];}
  Frame(){return EvaluateFlow(Math.min(this.time,this.beat.end-0.001),this.document);}
  Kill(id){this.dead.add(id);}
  Interact(){this.interacted.add(this.beat.id);if(CONFIG.interactionBeats.includes(this.beat.id))this.time=this.beat.end;}
  Step(dt,player,aliveIds) {
    if(this.completed)return;
    this.elapsed+=dt;
    this.time=Math.min(this.beat.end,this.time+dt);
    for(const trigger of this.compiled.triggers) {
      if(this.triggers.has(trigger.id)||this.time<trigger.start||this.time>trigger.end) continue;
      if(trigger.mode==="time"||InsideArea(player,trigger.area)) this.triggers.set(trigger.id,this.elapsed);
    }
    const endpoint=this.beat.p.at(-1), cinematic=ENCOUNTER_CINEMATICS.includes(this.beat.id);
    const needed=CONFIG.clearGroups[this.beat.id]||[];
    this.waiting=this.time<this.beat.end?null:!cinematic&&Distance(player,endpoint)>(CONFIG.reachByBeat?.[this.beat.id]??CONFIG.reachM)?"reach":
      needed.some(id=>{
        const group=this.compiled.groups.find(g=>g.id===id);
        return group?.enabled&&(this.groups.get(id).count<group.count||[...aliveIds].some(actor=>actor.startsWith(id+"_")));
      })?"combat":
      CONFIG.interactionBeats.includes(this.beat.id)&&!this.interacted.has(this.beat.id)?"interact":null;
    if(this.time>=this.beat.end&&!this.waiting) {
      if(this.beatIndex===FLOW_TIMELINE.length-1){this.completed=true;return;}
      this.beatIndex++;this.time=this.beat.start;
    }
  }
  Spawns(aliveIds) {
    const result=[];
    for(const group of this.compiled.groups) {
      if(!group.enabled||!this.triggers.has(group.triggerId)||this.time>group.end)continue;
      const state=this.groups.get(group.id),live=[...aliveIds].filter(id=>id.startsWith(group.id+"_")).length;
      if(state.count>=group.count||live>=group.maxAlive||group.reinforceAfterClear&&state.count>=group.maxAlive&&live>0)continue;
      if(this.elapsed-state.lastSpawn<group.interval)continue;
      const index=state.count,path=GroupPath(group,index),p=path[0];
      result.push({id:group.id+"_"+index,name:group.label,side:group.side,kind:"person",p,pose:"stand",groupId:group.id,
        heavy:group.weapon==="machineGun"&&index%group.maxAlive===0,route:path,group});
    }
    return result;
  }
  Spawned(actor) {
    this.spawned.add(actor.id);
    const group=this.groups.get(actor.groupId);
    if(group){group.count++;group.lastSpawn=this.elapsed;}
  }
  State(){return {scene:CONFIG.scene,beat:this.beat.id,startBeat:this.startBeat.id,time:this.time,elapsed:this.elapsed,waiting:this.waiting,completed:this.completed,dead:[...this.dead],triggers:[...this.triggers.keys()]};}
}
