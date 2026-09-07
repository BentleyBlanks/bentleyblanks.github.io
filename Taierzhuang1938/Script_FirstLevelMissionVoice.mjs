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
    this.audio.StopStoryVoice();
  }
  Resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.current?.phase === "playing") this.PlaySegment();
    if (this.current) this.current.index = -1;
  }
  Emit(id) {
    if (!id || this.current.events.has(id)) return;
    this.current.events.add(id);
    this.Event?.(id, this.current.cue.id);
  }
  PlaySegment() {
    const current = this.current, segment = current.plan.segments[current.segmentIndex];
    const played = this.audio.PlayStoryVoice(`Mission${current.cue.id}`, {
      position: this.Position?.(current.cue),
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
      const total=this.audio.voiceBank?.get(`Mission${cue.id}`)?.duration
        || this.manifest.cues[cue.id]?.seconds
        || cue.lines.reduce((sum,line)=>sum+Math.max(1.1,line.text.length/5.2),0);
      const plan=MissionVoiceTimeline(cue,total);
      this.current={cue,plan,total,time:0,index:-1,sourceTime:0,segmentIndex:0,
        phase:"waiting",wait:plan.segments[0].wait||0,events:new Set()};
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
    if(index>=0 && current.sourceTime<segment.end && index!==current.index && current.cue.subtitles!==false){
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
    };
  }
  Dispose() {
    this.audio.StopStoryVoice();
    this.queue=[];
    this.current=null;
  }
}
