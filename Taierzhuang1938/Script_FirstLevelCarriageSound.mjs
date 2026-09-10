import {CARRIAGE_SOUND as C} from "./Data_FirstLevelCarriageSound.mjs";

// Crowd reactions follow actual passengers while the train moves.
export class FirstLevelCarriageSound {
  Position(actor) { return {x:actor.position.x,y:actor.position.y+1.2,z:actor.position.z}; }
  constructor(audio, Passengers) { this.audio=audio;this.Passengers=Passengers;this.live=[]; }
  Start() {
    this.Dispose();
    this.audio.Ambience(C.preset);
    this.audio.SetAmbienceLayerLevel?.(C.crowdBed,1,.1);
  }
  Handle(id) {
    if(id==="CarriageUneasy") {
      this.audio.SetAmbienceLayerLevel?.(C.crowdBed,C.uneasyScale,1.3);
      return true;
    }
    const index=C.reactions.findIndex(reaction=>reaction.id===id);
    if(index<0)return false;
    const actor=this.Passengers().find(entry=>entry.carIndex===1&&entry.slot===C.cheerSlots[index])?.actor;
    if(!actor?.alive)return true;
    const voice=this.audio.Play(C.cheerCue,{position:this.Position(actor),volume:C.cheerVolume,pitch:1,priority:true,bus:"ambience"});
    if(voice)this.live.push({voice,actor,remaining:voice.duration||8});
    return true;
  }
  Update(dt) {
    this.live=this.live.filter(item=>{
      item.remaining-=dt;
      if(item.remaining<=0||!item.actor.alive){this.audio.StopVoice(item.voice);return false;}
      this.audio.MoveVoice(item.voice,this.Position(item.actor));
      return true;
    });
  }
  Impact() { this.Dispose();this.audio.Ambience("trainInterior"); }
  Stopped() { this.Dispose();this.audio.Ambience("firstLevelFront"); }
  Dispose() { for(const item of this.live)this.audio.StopVoice(item.voice);this.live=[]; }
}
