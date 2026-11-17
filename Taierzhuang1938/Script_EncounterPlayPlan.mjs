import { FLOW_TIMELINE, EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT, BeatById, Distance } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import { CompileEncounters, ValidateEncounterDocument, GroupPath, ENCOUNTER_CINEMATICS } from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import { InsideArea } from "./Scenes/FirstLevelEncounter/Script_LevelFlowGeometry.mjs";
import { ENCOUNTER_PLAY as CONFIG } from "./Scenes/FirstLevelEncounter/Data_Play.mjs";

export { CONFIG as ENCOUNTER_PLAY_CONFIG };
export function EncounterSceneSignals(frame, facts=[]) {
  return new Set([...CONFIG.signals.filter(s=>s.beat?frame.beat.id>=s.beat:frame.time>=s.time).map(s=>s.id),...facts]);
}
export function EncounterStartBeat(time=0) {
  return FLOW_TIMELINE.find(b=>time<b.end)||FLOW_TIMELINE.at(-1);
}
export function EncounterCanPlay(time) {
  const beat=EncounterStartBeat(time);
  return beat.start>=BeatById(CONFIG.firstPlayableBeat).start&&!ENCOUNTER_CINEMATICS.includes(beat.id)&&!!CONFIG.gates[beat.id];
}
export function EncounterFirstPlayable(){return BeatById(CONFIG.firstPlayableBeat);}
export function EncounterPlayerYaw(beat) {
  const from=beat.p[0],to=beat.lookAt||beat.p.find(p=>Distance(p,from)>.1);
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
    this.startBeat=time===0?EncounterFirstPlayable():EncounterStartBeat(time);
    if(!EncounterCanPlay(this.startBeat.start))throw new Error("镜头动画段暂不支持 Play");
    this.time=this.startBeat.start;this.elapsed=0;this.beatIndex=FLOW_TIMELINE.indexOf(this.startBeat);
    this.startIndex=this.beatIndex;this.enteredAt=new Map([[this.startBeat.id,0]]);
    this.beatOrder=new Map(FLOW_TIMELINE.map((beat,index)=>[beat.id,index]));
    this.compiled=CompileEncounters(this.document,FLOW_TIMELINE);
    this.dead=new Set();this.spawned=new Set();this.triggers=new Map();this.groups=new Map();
    this.interacted=new Set();this.completed=false;this.waiting=null;this.beatElapsed=0;this.facts=new Set();this.killed=new Set();this.phaseKills=new Set();this.completedBeats=[];this.entryPosition=[...this.startBeat.p[0]];
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
    // A selected combat keyframe starts its required encounter fresh. Preview
    // lifetime estimates are not evidence that its required targets were killed.
    const required=new Set([...(this.gate.clear||[]),...(this.gate.kills?.groups||[])]);
    for(const id of required){
      const group=this.groups.get(id);if(group)group.count=0;
      for(const dead of this.dead)if(dead.startsWith(id+"_"))this.dead.delete(dead);
      const spec=this.compiled.groups.find(g=>g.id===id),trigger=this.compiled.triggers.find(t=>t.id===spec?.triggerId);
      if(spec?.enabled&&trigger&&this.beatOrder.get(trigger.endBeat)<this.startIndex)this.triggers.set(trigger.id,0);
    }
    for(const id of this.gate.kill||[])this.dead.delete(id);
    if(this.startBeat.id>="06g")this.facts.add("tank1Destroyed");
    if(this.startBeat.id>="06i")this.facts.add("tank2Destroyed");
    this.initial=snapshot.actors.filter(a=>!required.has(a.groupId)&&!this.dead.has(a.id)).map(a=>(this.gate.kill||[]).includes(a.id)?{...a,pose:"shoot",firing:true}:a);
  }
  get beat(){return FLOW_TIMELINE[this.beatIndex];}
  get gate(){return CONFIG.gates[this.beat.id];}
  Frame(){
    const frame=EvaluateFlow(Math.min(this.time,this.beat.end-0.001),this.document);
    for(const a of frame.actors){
      if((this.gate.kill||[]).includes(a.id)&&!this.dead.has(a.id)){a.pose="shoot";a.firing=true;}
      if(a.kind==="tank")a.pose=this.facts.has(a.id+"Destroyed")?"burn":"stand";
    }
    return frame;
  }
  Kill(id){if(!this.dead.has(id)){this.killed.add(id);this.phaseKills.add(id);}this.dead.add(id);}
  Interact(){this.interacted.add(this.beat.id);for(const signal of this.gate.signals||[])this.facts.add(signal);}
  Area(){const trigger=this.gate.target!=="end"&&this.compiled.triggers.find(t=>t.id==="Arrival_"+this.beat.id);return trigger?.area||{shape:"circle",center:this.beat.p.at(-1),size:[(CONFIG.reachByBeat?.[this.beat.id]??CONFIG.reachM)*2,(CONFIG.reachByBeat?.[this.beat.id]??CONFIG.reachM)*2]};}
  CanInteract(player){return !!this.gate.action&&InsideArea(player,this.Area())&&!this.interacted.has(this.beat.id);}
  Step(dt,player,aliveIds,events={}) {
    if(this.completed)return;
    this.elapsed+=dt;
    this.beatElapsed+=dt;this.time=Math.min(this.beat.end-.001,this.beat.start+this.beatElapsed);
    for(const trigger of this.compiled.triggers) {
      if(this.triggers.has(trigger.id)||this.beatIndex<this.beatOrder.get(trigger.beat)||this.beatIndex>this.beatOrder.get(trigger.endBeat))continue;
      const entered=this.enteredAt.get(trigger.beat)??(this.beatOrder.get(trigger.beat)<this.startIndex?BeatById(trigger.beat).start-this.startBeat.start:null);
      if(entered===null||this.elapsed-entered<trigger.delay)continue;
      if(trigger.mode==="time"||InsideArea(player,trigger.area)) this.triggers.set(trigger.id,this.elapsed);
    }
    for(const fact of events.facts||[])this.facts.add(fact);
    const gate=this.gate,waiting=[];
    if(gate.area&&(!InsideArea(player,this.Area())||Distance(player,this.entryPosition)<.1))waiting.push("reach");
    if(gate.retreat&&Distance(player,this.beat.p.at(-1))>CONFIG.reachM)waiting.push("retreat");
    if((gate.kill||[]).some(id=>!this.killed.has(id)))waiting.push("combat");
    if((gate.clear||[]).some(id=>{
        const group=this.compiled.groups.find(g=>g.id===id);
        return group?.enabled&&(this.groups.get(id).count<group.count||Array.from({length:group.count},(_,i)=>id+"_"+i).some(actor=>!this.dead.has(actor)));
      }))waiting.push("combat");
    if(gate.kills){
      const available=this.compiled.groups.filter(g=>g.enabled&&gate.kills.groups.includes(g.id)).reduce((sum,g)=>sum+g.count,0);
      if([...this.killed].filter(id=>gate.kills.groups.some(group=>id.startsWith(group+"_"))).length<Math.min(gate.kills.count,available))waiting.push("combat");
    }
    if(gate.action&&!this.interacted.has(this.beat.id))waiting.push("interact");
    if(gate.fact&&!this.facts.has(gate.fact))waiting.push("event");
    if(gate.event&&!events[gate.event])waiting.push("event");
    if(gate.escort&&(events.escorted||0)<gate.escort)waiting.push("escort");
    if((gate.departed||[]).some(id=>!events.departed?.includes(id)))waiting.push("departure");
    this.conditions=[...new Set(waiting)];this.waiting=this.conditions[0]||null;
    if(!this.waiting) {
      this.completedBeats.push(this.beat.id);
      let next=this.beatIndex+1;while(next<FLOW_TIMELINE.length&&!EncounterCanPlay(FLOW_TIMELINE[next].start))next++;
      if(next===FLOW_TIMELINE.length){this.completed=true;return;}
      for(let index=this.beatIndex+1;index<=next;index++)this.enteredAt.set(FLOW_TIMELINE[index].id,this.elapsed);
      this.beatIndex=next;this.time=this.beat.start;this.beatElapsed=0;this.phaseKills.clear();this.entryPosition=[...player];
    }
  }
  Spawns(aliveIds) {
    const result=[];
    for(const group of this.compiled.groups) {
      if(!group.enabled||!this.triggers.has(group.triggerId)||(this.time>group.end&&![...(this.gate.clear||[]),...(this.gate.kills?.groups||[])].includes(group.id)))continue;
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
  State(){return {scene:CONFIG.scene,beat:this.beat.id,startBeat:this.startBeat.id,time:this.time,timelineTime:this.beat.start,elapsed:this.elapsed,waiting:this.waiting,conditions:this.conditions||[],completed:this.completed,completedBeats:[...this.completedBeats],dead:[...this.dead],triggers:[...this.triggers.keys()]};}
}
