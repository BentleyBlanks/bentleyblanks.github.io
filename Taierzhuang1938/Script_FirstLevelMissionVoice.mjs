import { CARRIAGE_SOUND } from "./Data_FirstLevelCarriageSound.mjs";
import { MissionVoiceTimeline } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { MISSION_DIALOGUE, MISSION_VOICE_CAST } from "./Data_FirstLevelMissionDialogue.mjs";
import { Localize } from "./Script_Text.mjs";
import { FirstLevelVoiceTextId, FirstLevelCastTextId } from "./Script_TextIds.mjs";
export class FirstLevelMissionVoice {
  constructor({ audio, hud, Position, Done, Event, Ready, Clock }) {
    Object.assign(this, { audio, hud, Position, Done, Event, Ready, Clock });
    this.queue = [];
    this.played = new Set();
    this.finished = new Set();
    this.current = null;
    this.paused = false;
    this.manifest = { cues: {} };
    this.loaded = false;
    this.errors = [];
  }
  async Load() {
    try {
      const response = await fetch(
        new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json", import.meta.url),
        { cache: "no-cache", signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw new Error(`Voice manifest HTTP ${response.status}`);
      this.manifest = await response.json();
      const entries = MISSION_DIALOGUE.filter((cue) => this.manifest.cues[cue.id]).map((cue) => ({
        key: `Mission${cue.id}`,
        file: cue.file,
        kind: "story",
        side: cue.subtitles === false ? "ija" : "nra",
        gain: 1,
        version: this.manifest.cues[cue.id].sha256,
      }));
      await this.audio.LoadVoices(new URL("./Audio/FirstLevel/", import.meta.url).href, entries);
      this.loaded = true;
    } catch (error) {
      this.errors.push(error.message);
    }
  }
  Enqueue(id, { urgent = false } = {}) {
    if (!id || this.played.has(id) || this.queue.includes(id)) return false;
    if (urgent) {
      this.StopParallel();
      this.audio.StopStoryVoice();
      this.current = null;
      this.queue = [];
    }
    this.queue.push(id);
    return true;
  }
  Finish() {
    if (!this.current) return;
    const id = this.current.cue.id;
    this.DialogueLine(this.current, -1);
    this.StopParallel();
    this.audio.StopStoryVoice();
    this.finished.add(id);
    this.current = null;
    this.Done?.(id);
  }
  Replay(id) {
    this.paused = false;
    this.played.delete(id);
    this.finished.delete(id);
    this.queue = this.queue.filter(cue => cue !== id);
    this.Enqueue(id, { urgent: true });
  }
  Pause() {
    this.paused = true;
    this.StopParallel();
    this.audio.StopStoryVoice();
  }
  Resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.current?.phase === "playing") this.PlaySegment();
    for (const track of this.current?.parallel || []) if (!track.finished) this.PlayParallel(track);
    if (this.current) this.current.index = -1;
  }
  Emit(id) {
    if (!id || this.current.events.has(id)) return;
    this.current.events.add(id);
    this.Event?.(id, this.current.cue.id);
  }
  Duration(cue) {
    return this.audio.voiceBank?.get(`Mission${cue.id}`)?.duration
      || this.manifest.cues[cue.id]?.seconds
      || cue.lines.reduce((sum,line)=>sum+Math.max(1.1,line.text.length/5.2),0);
  }
  DialogueLine(track, index) {
    if (!track.cue.id.startsWith("Train") || index === track.dialogueIndex) return;
    const Notify = (lineIndex, active) => {
      if (lineIndex < 0 || lineIndex == null) return;
      const [start,end] = track.plan.lines[lineIndex];
      this.Event?.("TrainDialogueLine", track.cue.id, {who:track.cue.lines[lineIndex].who,
        index:lineIndex,start,end,sourceTime:track.sourceTime,active});
    };
    Notify(track.dialogueIndex,false); track.dialogueIndex=index; Notify(index,true);
  }
  StopParallel() {
    for (const track of this.current?.parallel || []) {
      if (track.voice) this.audio.StopVoice?.(track.voice);
      track.voice=null;
    }
  }
  PlayParallel(track) {
    const line=track.cue.lines[Math.max(0,track.index)];
    const voice=this.audio.voiceMute?null:this.audio.Play?.(`voice.Mission${track.cue.id}`,{
      position:this.Position?.(track.cue,line),offset:track.sourceTime,
      maxDuration:track.total-track.sourceTime,volume:1,pitch:1,priority:true,
    });
    track.voice=voice;
    track.clock=voice&&Number.isFinite(this.Clock?.())?(voice.t??this.Clock()):null;
    track.clockSource=track.sourceTime;
  }
  UpdateParallel(dt) {
    const current=this.current;
    for(const authored of current.plan.parallel||[]) {
      if(current.sourceTime<authored.at || current.parallel.some(track=>track.cue.id===authored.id))continue;
      const cue=MISSION_DIALOGUE.find(entry=>entry.id===authored.id),total=this.Duration(cue);
      const track={cue,total,plan:MissionVoiceTimeline(cue,total),sourceTime:0,index:-1,dialogueIndex:-1,finished:false};
      current.parallel.push(track); this.played.add(cue.id); this.PlayParallel(track);
      this.Event?.("TrainBriefingStart",cue.id);
    }
    for(const track of current.parallel) {
      if(track.finished)continue;
      const clock=this.Clock?.();
      track.sourceTime=Math.min(track.total,track.clock!=null&&Number.isFinite(clock)
        ?track.clockSource+Math.max(0,clock-track.clock):track.sourceTime+dt);
      const index=track.plan.lines.findIndex(([start,end])=>track.sourceTime>=start&&track.sourceTime<end);
      track.started=index>=0&&index!==track.index; track.index=index;
      this.DialogueLine(track,index);
      const position=this.Position?.(track.cue,track.cue.lines[Math.max(0,index)]);
      if(position&&track.voice)this.audio.MoveVoice?.(track.voice,position);
      if(track.sourceTime>=track.total) {
        if(track.voice)this.audio.StopVoice?.(track.voice);
        track.voice=null; track.finished=true; this.finished.add(track.cue.id); this.Done?.(track.cue.id);
      }
    }
  }
  ShowParallelSubtitles() {
    const current=this.current,tracks=[current,...current.parallel];
    const signature=tracks.map(track=>`${track.cue.id}:${track.index}`).join("|");
    if(signature===current.subtitleSignature)return;
    current.subtitleSignature=signature;
    const rows=tracks.filter(track=>track.index>=0).map(track=>{
      const line=track.cue.lines[track.index];
      return {speaker:Localize(FirstLevelCastTextId(line.who),MISSION_VOICE_CAST[line.who][0]),
        text:Localize(FirstLevelVoiceTextId(track.cue.id,track.index),line.text),
        started:track.started,seconds:Math.max(.05,track.plan.lines[track.index][1]-track.sourceTime)};
    });
    const seconds=Math.min(...rows.map(row=>row.seconds),60);
    if(this.hud.SayLines)this.hud.SayLines(rows,seconds);
    else for(const row of rows)if(row.started)this.hud.Say(row.speaker,row.text,row.seconds);
  }
  PlaySegment() {
    const current = this.current, segment = current.plan.segments[current.segmentIndex];
    const played = this.audio.PlayStoryVoice(`Mission${current.cue.id}`, {
      position: this.Position?.(current.cue,current.cue.lines[Math.max(0,current.index)]),
      environmentGain:["TrainMeal","TrainBanter"].includes(current.cue.id)?CARRIAGE_SOUND.speechBedGain:
        current.cue.id==="TrainShelling"?CARRIAGE_SOUND.escapeSpeechBedGain:1,
      offset: current.sourceTime,
      maxDuration: segment.end-current.sourceTime,
    });
    current.clock = played?.voice && Number.isFinite(this.Clock?.()) ? (played.voice.t ?? this.Clock()) : null;
    current.clockSource = current.sourceTime;
    current.phase = "playing";
  }
  BeginSegment() {
    const current = this.current, segment = current.plan.segments[current.segmentIndex];
    current.sourceTime = segment.start;
    current.index = -1;
    this.PlaySegment();
    this.Emit(segment.startEvent);
  }
  Update(dt) {
    if (this.paused) return;
    if (!this.current && this.queue.length) {
      const id=this.queue.shift(), cue=MISSION_DIALOGUE.find(cue=>cue.id===id);
      if (!cue) return;
      const total=this.Duration(cue);
      const plan=MissionVoiceTimeline(cue,total);
      this.current={cue,plan,total,time:0,index:-1,sourceTime:0,segmentIndex:0,
        phase:"waiting",wait:plan.segments[0].wait||0,events:new Set(),parallel:[],dialogueIndex:-1};
      this.played.add(cue.id);
    }
    const current=this.current;
    if (!current) return;
    current.time+=dt;
    if (current.phase==="tail") {
      current.wait-=dt;
      if(current.wait<=0)this.Finish();
      return;
    }
    const segment=current.plan.segments[current.segmentIndex];
    if(current.phase==="waiting"){
      if(current.parallel.length) {this.UpdateParallel(dt);this.ShowParallelSubtitles();}
      current.wait=Math.max(0,current.wait-dt);
      if(current.wait>0 || (segment.gate && this.Ready?.(segment.gate)===false))return;
      this.BeginSegment();
      // The audio starts now; do not consume the waiting frame twice.
      return;
    }
    const clock=this.Clock?.();
    current.sourceTime=Math.min(segment.end, current.clock!=null && Number.isFinite(clock)
      ? current.clockSource+Math.max(0,clock-current.clock)
      : current.sourceTime+dt);
    for(const event of segment.events||[])if(current.sourceTime>=event.at)this.Emit(event.id);
    const index=current.plan.lines.findIndex(([start,end])=>current.sourceTime>=start&&current.sourceTime<end);
    const spokenIndex=current.sourceTime<segment.end?index:-1;
    this.DialogueLine(current,spokenIndex);
    const position=this.Position?.(current.cue,current.cue.lines[Math.max(0,index)]);
    if(position&&this.audio.storyVoice)this.audio.MoveVoice?.(this.audio.storyVoice,position);
    if(current.plan.parallel) {
      current.started=spokenIndex>=0&&spokenIndex!==current.index; current.index=spokenIndex;
      this.UpdateParallel(dt);this.ShowParallelSubtitles();
    } else if(index>=0 && current.sourceTime<segment.end && index!==current.index && current.cue.subtitles!==false){
      current.index=index;
      const line=current.cue.lines[index];
      this.hud.Say(Localize(FirstLevelCastTextId(line.who),MISSION_VOICE_CAST[line.who][0]),
        Localize(FirstLevelVoiceTextId(current.cue.id,index),line.text),
        Math.max(.05,Math.min(segment.end,current.plan.lines[index][1])-current.sourceTime));
    }
    if(current.sourceTime>=segment.end){
      this.audio.StopStoryVoice();
      this.Emit(segment.endEvent);
      current.segmentIndex++;
      const next=current.plan.segments[current.segmentIndex];
      current.phase=next?"waiting":"tail";
      current.wait=next?(next.wait||0):(current.plan.tail||0);
      current.index=-1;
      if(!next&&current.wait<=0)this.Finish();
    }
  }
  State() {
    return {
      loaded:this.loaded,paused:this.paused,available:Object.keys(this.manifest.cues).length,
      required:MISSION_DIALOGUE.length,played:[...this.played],finished:[...this.finished],
      current:this.current?.cue.id||null,queue:[...this.queue],errors:[...this.errors],
      segment:this.current?.plan.segments[this.current.segmentIndex]?.id||null,
      playbackPhase:this.current?.phase||null,sourceTime:this.current?.sourceTime||0,
      parallel:(this.current?.parallel||[]).map(track=>({id:track.cue.id,sourceTime:track.sourceTime,
        total:track.total,finished:track.finished,speaker:track.index>=0?track.cue.lines[track.index].who:null})),
    };
  }
  Dispose() {
    this.StopParallel();
    this.audio.StopStoryVoice();
    this.queue=[];
    this.current=null;
  }
}
