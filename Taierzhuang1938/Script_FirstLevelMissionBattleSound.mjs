import { MISSION_BATTLE_SOUND as D } from './Data_FirstLevelMissionBattleSound.mjs';
export class FirstLevelMissionBattleSound {
  constructor(audio) { this.audio=audio;this.elapsed=0;this.voices=[];this.events=[];
    this.sources=D.sources.map(spec=>({spec,next:spec.first,count:0})); }
  Update(dt,stage,speaking=false) {
    const profile=D.profiles[stage];
    if(!profile)return;
    this.elapsed+=dt;
    this.voices=this.voices.filter(v=>this.audio.pendingVoices?.has(v));
    for(const source of this.sources){
      if(this.elapsed<source.next)continue;
      const s=source.spec;
      source.next=this.elapsed+s.intervals[source.count%s.intervals.length]*profile.interval;
      source.count++;
      const options={position:{x:s.x,y:s.y,z:s.z},volume:s.volume*profile.gain*(speaking?D.speechGain:1),
        airCut:s.airCut,burst:s.burst,bus:'ambience',soundField:true};
      const voice=this.audio.Play(s.cue,options);
      if(voice)this.voices.push(voice);
      this.events.push({id:s.id,cue:s.cue,at:this.elapsed,stage,position:options.position,volume:options.volume,played:!!voice});
      if(this.events.length>48)this.events.shift();
    }
  }
  State(){return {elapsed:this.elapsed,sources:this.sources.map(s=>({id:s.spec.id,count:s.count})),recent:this.events.slice(-12)};}
  Dispose(){for(const voice of this.voices)this.audio.FreeVoice?.(voice);this.voices=[];}
}
