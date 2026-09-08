import { MISSION_BATTLE_SOUND as D } from './Data_FirstLevelMissionBattleSound.mjs';
export class FirstLevelMissionBattleSound {
  constructor(audio) { this.audio=audio;this.elapsed=0;this.voices=[];this.events=[];this.startedAt=null;
    this.sources=D.sources.map(spec=>({spec,next:spec.first,count:0})); }
  Update(dt,stage,speaking=false) {
    const profile=D.profiles[stage];
    if(!profile)return;
    this.elapsed+=dt;
    this.voices=this.voices.filter(v=>this.audio.pendingVoices?.has(v));
    // 有 startAfterS 的档（车厢）在开档之前不撒，开档那一刻把每条声源的第一次
    // **重新排一遍** —— 否则攒了十二秒的 next 会在同一帧一起放炮。
    const active=this.elapsed-(profile.startAfterS||0);
    if(active<0)return;
    if(this.startedAt===null){
      this.startedAt=this.elapsed;
      if(profile.startAfterS)for(const source of this.sources)source.next=this.elapsed+source.spec.first;
    }
    // 军列一路往北开，前线由「几乎听不见」长到「就在前头」。没有 rampS 的档恒为 1。
    const ramp=profile.rampS>0
      ? (profile.rampFromGain??1)+(1-(profile.rampFromGain??1))*Math.min(1,active/profile.rampS) : 1;
    for(const source of this.sources){
      if(this.elapsed<source.next)continue;
      const s=source.spec;
      source.next=this.elapsed+s.intervals[source.count%s.intervals.length]*profile.interval;
      source.count++;
      const options={position:{x:s.x,y:s.y,z:s.z},volume:s.volume*profile.gain*ramp*(speaking?D.speechGain:1),
        // 车厢那一档再压一道墙：隔着木板与铁皮，外面只剩低频。
        airCut:Math.min(s.airCut,profile.airCut??Infinity),burst:s.burst,bus:'ambience',soundField:true};
      const voice=this.audio.Play(s.cue,options);
      if(voice)this.voices.push(voice);
      this.events.push({id:s.id,cue:s.cue,at:this.elapsed,stage,position:options.position,volume:options.volume,played:!!voice});
      if(this.events.length>48)this.events.shift();
    }
  }
  State(){return {elapsed:this.elapsed,sources:this.sources.map(s=>({id:s.spec.id,count:s.count})),recent:this.events.slice(-12)};}
  Dispose(){for(const voice of this.voices)this.audio.FreeVoice?.(voice);this.voices=[];}
}
