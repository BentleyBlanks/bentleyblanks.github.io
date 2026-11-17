import { ENCOUNTER_PLAY as CONFIG } from "./Scenes/FirstLevelEncounter/Data_Play.mjs";
import { DrawFlowDialogue, SpeechHeadHeight } from "./Scenes/FirstLevelEncounter/Script_LevelFlowDialogue.mjs";

// Orders are tied to real gates, not the preview clock or an audio duration.
export function EncounterDialogueLines(plan, frame, {failed=false, exit=false, interact=false}={}) {
  if(failed || plan.completed)return [];
  let speech=frame.dialogue.filter(line=>!plan.dead.has(line.actorId));
  const guide=CONFIG.guidance[frame.beat.id];
  if(!guide)return speech;
  const actor=frame.actors.find(actor=>actor.id===guide.actor&&!plan.dead.has(actor.id));
  // A dead/absent leader does not speak through walls or from beyond the grave.
  // The existing task remains readable as an unattributed fallback instruction.
  const text=!actor?frame.beat.task:exit&&guide.exit?guide.exit:
    plan.interacted.has(frame.beat.id)&&guide.afterAction?guide.afterAction:guide.text;
  const order={id:frame.beat.id+"_order",actorId:actor?.id||null,name:actor?.name||"",
    text:text+(interact?"\n"+CONFIG.ui.interact:""),order:true};
  if(exit&&guide.exit||plan.interacted.has(frame.beat.id)&&guide.afterAction)speech=speech.filter(line=>line.actorId!==actor?.id);
  return [...speech,order];
}

// Uses the live soldier/puppet position and the final display camera. Projection
// rejects points behind the camera; no screen-edge bubble points at a false head.
export function EncounterSpeechAnchor(position, actor, camera, width, height, battlefield) {
  if(!position)return null;
  const head=position.clone();head.y+=SpeechHeadHeight(actor);
  const projected=head.clone().project(camera);
  if(projected.z<=-1||projected.z>=1||Math.abs(projected.x)>1||Math.abs(projected.y)>1)return null;
  const from=camera.position,direction=head.clone().sub(from),range=direction.length();
  if(range>CONFIG.dialogue.occlusionSlackM){
    const hit=battlefield.Raycast(from,direction.divideScalar(range),range,{terrain:true});
    if(hit&&(hit.t??hit.distance)<range-CONFIG.dialogue.occlusionSlackM)return null;
  }
  return [(projected.x+1)*width/2,(1-projected.y)*height/2];
}

export class EncounterPlayDialogue {
  constructor(host, view, resolve) {
    this.host=host;this.view=view;this.resolve=resolve;this.lines=[];this.bubbles=[];
    this.canvases=["main","observer"].map(id=>{
      const canvas=document.createElement("canvas");canvas.className="encounterSpeech encounterSpeech"+id;
      canvas.setAttribute("aria-hidden","true");document.body.append(canvas);return canvas;
    });
    this.fallback=document.createElement("div");this.fallback.className="encounterDialogue";
    this.fallback.setAttribute("role","status");this.fallback.setAttribute("aria-live","polite");
    this.fallback.hidden=true;document.body.append(this.fallback);
  }
  Set(frame,lines) {this.frame=frame;this.lines=lines;}
  Render() {
    const frame=this.frame;
    this.bubbles=[];
    for(const [index,canvas] of this.canvases.entries()) {
      const source=index===0?this.host.canvas:this.view.canvas;
      const active=!!frame&&this.lines.length>0&&(index===0||this.view.count===2);
      canvas.hidden=!active;
      if(!active)continue;
      const rect=source.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
      canvas.style.left=rect.left+"px";canvas.style.top=rect.top+"px";
      canvas.style.width=width+"px";canvas.style.height=height+"px";
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      const context=canvas.getContext("2d");context.clearRect(0,0,width,height);
      const camera=index===0?this.host.camera:this.view.camera;
      const anchors=new Map();
      for(const line of this.lines){
        const actor=frame.actors.find(actor=>actor.id===line.actorId);
        if(!actor||index===0&&actor.id==="player")continue;
        const live=this.resolve(actor.id);
        if(!live)continue;
        anchors.set(actor.id,EncounterSpeechAnchor(live.position,{...actor,pose:live.pose||actor.pose},camera,width,height,this.host.battlefield));
      }
      // Narrative speech gets its speaker's bubble; the persistent order stays
      // readable below instead of drawing a second box on the same head.
      const speaking=new Set(this.lines.filter(line=>!line.order).map(line=>line.actorId));
      const bubbles=DrawFlowDialogue(context,{SpeechAnchor:actor=>anchors.get(actor.id)},
        {...frame,dialogue:this.lines.filter(line=>!line.order||!speaking.has(line.actorId))},width,height);
      this.bubbles[index]=bubbles;
    }
    const shown=new Set((this.bubbles[0]||[]).map(line=>line.id));
    const fallback=this.lines.filter(line=>!shown.has(line.id));
    const key=JSON.stringify(fallback.map(line=>[line.id,line.name,line.text]));
    if(key!==this.fallbackKey){
      this.fallbackKey=key;this.fallback.replaceChildren();
      for(const line of fallback){const row=document.createElement("p");row.textContent=(line.name?line.name+"：":"")+line.text;this.fallback.append(row);}
    }
    this.fallback.hidden=!fallback.length;
  }
  State(){return {lines:this.lines,bubbles:this.bubbles.map(bubbles=>bubbles.map(({id,actorId,anchor,box})=>({id,actorId,anchor,box})))};}
  Clear(){this.frame=null;this.lines=[];this.Render();}
  Dispose(){for(const node of [...this.canvases,this.fallback])node.remove();}
}
