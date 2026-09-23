import { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
import { MissionVoiceTimeline } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { MISSION_DIALOGUE, MISSION_VOICE_CAST, MissionVoiceSubtitle } from "./Data_FirstLevelMissionDialogue.mjs";
import { FIRST_LEVEL_DIALOGUE_DIRECTION, LineDirection } from "./Data_FirstLevelDialogueDirection.mjs";
import { FIRST_LEVEL_VOICE_CAST } from "./Data_FirstLevelVoiceCast.mjs";
import { Localize } from "./Script_Text.mjs";
import { FirstLevelVoiceTextId, FirstLevelCastTextId } from "./Script_TextIds.mjs";
import { SampleSpeechEnvelope } from "./Script_SpeechEnvelope.mjs";
import { DialoguePlayer } from "./Script_DialoguePlayer.mjs";
// 两种格式并存（契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §2.2 / §5.5）：
//   · 逐句（cue.perLine）：01–06。每句一条干声，DialoguePlayer 按导演时间轴排、每句挂在说话人头上、
//     可重叠、侧链让路。入口 PlayScene / PlayLine（导演直接调，可并行）与 Say/Enqueue（排队，兼容旧调用）。
//     逐句录音还没烘完的 cue：若旧整段录音还在就先走旧整段（03–06 过渡期），否则按估时走字幕。
//   · 整段（旧格式）：07–18 与待 Opening 包下线的 09.21 旧 cue，行为不变。
const CHARS_PER_SECOND = Object.freeze({ zh: 4.6, ja: 7.5 });
/** 缺录音时按字数估一句的时长（秒）。 */
export function EstimateLineSeconds(line) {
  const chars = String(line.text || "").replace(/[\s，。！？、；：…—“”‘’「」（）,.!?]/g, "").length;
  return Math.max(0.6, chars / (CHARS_PER_SECOND[line.lang === "ja" ? "ja" : "zh"]) + 0.25);
}
export class FirstLevelMissionVoice {
  constructor({ audio, hud, Position, Listener, Done, Event, Ready, Clock }) {
    Object.assign(this, { audio, hud, Position, Listener, Done, Event, Ready, Clock });
    this.dialogue = new DialoguePlayer({
      audio,
      Clock,
      Listener,
      Subtitles: (rows, seconds) => {
        if (this.hud?.SayLines) this.hud.SayLines(rows, seconds);
        else for (const row of rows) if (row.started) this.hud?.Say?.(row.speaker, row.text, row.seconds);
      },
      Event: (id, sceneId, detail) => this.DialogueEvent(id, sceneId, detail),
    });
    /** 导演直接开的场景（PlayScene / PlayLine），不经队列。 */
    this.scenes = new Map();
    this.queue = [];
    this.played = new Set();
    this.finished = new Set();
    this.current = null;
    this.paused = false;
    this.manifest = { cues: {} };
    this.loaded = false;
    this.errors = [];
    // 缺录音的 cue 走字数估时长；未知 cue 直接拒收。两者都只警告一次。
    this.missing = new Set();
    this.unknown = new Set();
  }
  async Load() {
    try {
      const response = await fetch(
        new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json", import.meta.url),
        { cache: "no-cache", signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw new Error(`Voice manifest HTTP ${response.status}`);
      this.manifest = await response.json();
      this.manifest.cues ||= {};
      this.manifest.lines ||= {};
      const lineEntries = MISSION_DIALOGUE.filter((cue) => this.PerLineRecorded(cue)).flatMap((cue) => cue.lines.map((line) => ({
        key: this.LineKey(line.id),
        file: line.file,
        kind: "story",
        side: FIRST_LEVEL_VOICE_CAST[line.who]?.faction === "ija" ? "ija" : "nra",
        gain: 1,
        version: this.manifest.lines[line.id].sha256,
        analyzeSpeech: true,
      })));
      const entries = MISSION_DIALOGUE.filter((cue) => this.manifest.cues[cue.id] && !this.PerLineRecorded(cue)).map((cue) => ({
        key: `Mission${cue.id}`,
        file: cue.file,
        kind: "story",
        side: cue.subtitles === false ? "ija" : "nra",
        gain: 1,
        version: this.manifest.cues[cue.id].sha256,
        analyzeSpeech: true,
      }));
      await this.audio.LoadVoices(new URL("./Audio/FirstLevel/", import.meta.url).href, [...entries, ...lineEntries]);
      this.loaded = true;
    } catch (error) {
      this.errors.push(error.message);
    }
  }
  LineKey(lineId) { return `Mission${lineId.replace(".", "_")}`; }
  /** 这条逐句 cue 的每一句都有干声录音。 */
  PerLineRecorded(cue) {
    return !!cue?.perLine && cue.lines.every((line) => this.manifest.lines?.[line.id]);
  }
  /** 走逐句播放器：逐句录音齐了，或旧整段录音不存在（那就按估时走字幕）。 */
  UsesDialoguePlayer(cue) {
    return !!cue?.perLine && (this.PerLineRecorded(cue) || !this.manifest.cues?.[cue.id]);
  }
  /** 把台词表 + 导演表 + 清单拼成播放器要的场景。 */
  BuildScene(cue, only = null) {
    const lines = cue.lines.map((line, index) => {
      if (only && line.id !== only) return null;
      const key = this.LineKey(line.id), bank = this.audio?.voiceBank?.get(key);
      const entry = this.manifest.lines?.[line.id];
      const direction = LineDirection(cue, index);
      return {
        id: line.id, index, who: line.who, lang: line.lang || "zh",
        key: bank ? key : null,
        duration: bank?.duration || entry?.seconds || EstimateLineSeconds(line),
        sha256: entry?.sha256 || null,
        speaker: Localize(FirstLevelCastTextId(line.who), MISSION_VOICE_CAST[line.who]?.[0] || line.who),
        text: Localize(FirstLevelVoiceTextId(cue.id, index), MissionVoiceSubtitle(cue, index)),
        subtitle: cue.subtitles === false ? false : true,
        direction: only ? Object.freeze({ ...direction, after: "start", offsetS: 0 }) : direction,
      };
    }).filter(Boolean);
    return { id: cue.id, priority: FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id]?.priority ?? true, lines };
  }
  /**
   * 契约 §5.5：导演直接开一场对白（不排队，可与别的场景并行）。
   * speakers[who] = 演员 | () => Vector3 | Vector3；缺的人退回运行时的 VoicePosition。
   */
  PlayScene(sceneId, { speakers = {}, gate = null, onLine = null, onEnd = null, priority } = {}) {
    const cue = MISSION_DIALOGUE.find((entry) => entry.id === sceneId);
    if (!cue?.perLine) {
      if (!this.unknown.has(sceneId)) { this.unknown.add(sceneId); console.warn(`FirstLevelMissionVoice: ${sceneId} is not a per-line scene`); }
      return null;
    }
    this.scenes.get(sceneId)?.Stop();
    const handle = this.dialogue.Play(this.BuildScene(cue), {
      speakers, gate, priority,
      Position: (line) => this.Position?.(cue, cue.lines[line.index]),
      onLine, onEnd: (h) => { this.scenes.delete(sceneId); this.finished.add(sceneId); this.Done?.(sceneId); onEnd?.(h); },
    });
    this.played.add(sceneId);
    this.scenes.set(sceneId, handle);
    return handle;
  }
  /** 单独播一句（lineId = "<Scene>.<NN>"）。 */
  PlayLine(lineId, speaker = null, { onEnd = null, priority } = {}) {
    const sceneId = String(lineId).split(".")[0];
    const cue = MISSION_DIALOGUE.find((entry) => entry.id === sceneId);
    const line = cue?.lines.find((entry) => entry.id === lineId);
    if (!line) { console.warn(`FirstLevelMissionVoice: unknown line ${lineId}`); return null; }
    return this.dialogue.Play(this.BuildScene(cue, lineId), {
      speakers: speaker ? { [line.who]: speaker } : {}, priority,
      Position: () => this.Position?.(cue, line), onEnd,
    });
  }
  /** 导演事件（如 ThroatCut / Blast）：转给所有在播的逐句场景（after:event / stopOn 用）。 */
  Signal(name) {
    for (const handle of this.scenes.values()) handle.Signal(name);
    if (this.current?.scene) this.current.scene.Signal(name);
  }
  /** 播放器发的事件：Line 与具名事件原样转给运行时（与旧整段的 Line 事件同形）。 */
  DialogueEvent(id, sceneId, detail) {
    if (id === "SceneEnd") return;
    this.Event?.(id, sceneId, detail);
  }
  Enqueue(id, { urgent = false } = {}) {
    if (!id || this.played.has(id) || this.queue.includes(id)) return false;
    // 运行时可能还在引用已经下线的 cue id：拒收并警告一次，绝不抛异常也不排进队列。
    const cue = MISSION_DIALOGUE.find(entry => entry.id === id);
    if (!cue) {
      if (!this.unknown.has(id)) { this.unknown.add(id); console.warn(`FirstLevelMissionVoice: unknown cue ${id}`); }
      return false;
    }
    // Narrative events preempt optional reminders, never the other way round.
    if(!cue.guidance)this.CancelGuidance();
    if (urgent) {
      this.StopParallel();
      this.audio.StopStoryVoice();
      this.current?.scene?.Stop();
      this.current = null;
      this.queue = [];
    }
    this.queue.push(id);
    return true;
  }
  Guidance(id) {
    if(this.paused || this.current || this.queue.length || !MISSION_DIALOGUE.find(cue=>cue.id===id)?.guidance)return false;
    this.queue.push(id);
    return true;
  }
  CancelGuidance() {
    this.queue=this.queue.filter(id=>!MISSION_DIALOGUE.find(cue=>cue.id===id)?.guidance);
    if(!this.current?.cue.guidance)return;
    this.audio.StopStoryVoice();
    this.current=null;
    this.hud.Say?.(null,"",0);
  }
  Finish() {
    if (!this.current) return;
    const id = this.current.cue.id;
    if (this.current.scene) {
      this.current.scene.Stop();
      this.finished.add(id);
      this.current = null;
      this.Done?.(id);
      return;
    }
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
  Cancel(ids) {
    this.queue=this.queue.filter(id=>!ids.includes(id));
    for(const id of ids)this.played.add(id);
    for(const id of ids){this.scenes.get(id)?.Stop();this.scenes.delete(id);}
    if(this.current&&ids.includes(this.current.cue.id)){
      if(this.current.scene)this.current.scene.Stop();
      else{this.DialogueLine(this.current,-1);this.StopParallel();this.audio.StopStoryVoice();}
      this.current=null;
    }
  }
  Pause() {
    this.paused = true;
    this.StopParallel();
    this.audio.StopStoryVoice();
    this.dialogue.PauseAll();
  }
  Resume() {
    if (!this.paused) return;
    this.paused = false;
    this.dialogue.ResumeAll();
    if (this.current?.scene) return;
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
  // 每句开始发一条通用事件 Line，玩法包靠它把动作对到台词上（缺录音时照发）。
  DialogueLine(track, index) {
    if (index === track.dialogueIndex) return;
    track.dialogueIndex = index;
    if (index == null || index < 0) return;
    const [start, end] = track.plan.lines[index];
    this.Event?.("Line", track.cue.id, {
      who: track.cue.lines[index].who, index, start, end, sourceTime: track.sourceTime,
    });
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
      // Admit optional speech only when the entire take can finish with the main exchange.
      if(current.sourceTime+total>current.plan.segments.at(-1).end)continue;
      const position=this.Position?.(cue,cue.lines[0]),listener=this.Listener?.();
      if(authored.maxDistance&&position&&listener&&Math.hypot(position.x-listener.x,position.z-listener.z)>authored.maxDistance)continue;
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
    const listener=this.Listener?.();
    const rows=tracks.filter(track=>track.index>=0).map(track=>{
      const line=track.cue.lines[track.index],at=listener&&this.Position?.(track.cue,line);
      return {speaker:Localize(FirstLevelCastTextId(line.who),MISSION_VOICE_CAST[line.who][0]),
        text:Localize(FirstLevelVoiceTextId(track.cue.id,track.index),MissionVoiceSubtitle(track.cue,track.index)),
        emphasis:track.cue.subtitleEmphasis||"lead",
        distanceM:at?Math.hypot(at.x-listener.x,at.y-listener.y,at.z-listener.z):null,
        started:track.started,seconds:Math.max(.05,track.plan.lines[track.index][1]-track.sourceTime)};
    });
    const seconds=Math.min(...rows.map(row=>row.seconds),60);
    if(this.hud.SayLines)this.hud.SayLines(rows,seconds);
    else for(const row of rows)if(row.started)this.hud.Say(row.speaker,row.text,row.seconds);
  }
  // Alignment gaps belong to the speaker who just finished. Falling back to
  // line zero here used to fling the entire take back across the room on pauses.
  Speaker(track) {
    let index = 0;
    for (let i = 0; i < track.plan.lines.length; i++) {
      if (track.plan.lines[i][0] > track.sourceTime) break;
      index = i;
    }
    return track.cue.lines[index];
  }
  PlaySegment() {
    const current = this.current, segment = current.plan.segments[current.segmentIndex];
    const line = this.Speaker(current);
    // 缺录音的 cue 不碰音频引擎，但字幕、Line 事件和 Done 照常按估算时长走完。
    const played = current.recorded ? this.audio.PlayStoryVoice(`Mission${current.cue.id}`, {
      position: this.Position?.(current.cue,line),
      dialogue: true, firstPerson: line.who === "shunzi",
      environmentGain:MISSION_TUNING.storyVoiceBedGain,
      offset: current.sourceTime,
      maxDuration: segment.end-current.sourceTime,
    }) : null;
    current.clock = played?.voice && Number.isFinite(this.Clock?.()) ? (played.voice.t ?? this.Clock()) : null;
    current.voice = played?.voice || null;
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
    this.dialogue.Update(dt);
    if (this.current?.scene) {
      if (this.current.scene.done) {
        const id = this.current.cue.id;
        this.current = null;
        this.finished.add(id);
        this.Done?.(id);
      }
      return;
    }
    if (!this.current && this.queue.length) {
      const id=this.queue.shift(), cue=MISSION_DIALOGUE.find(cue=>cue.id===id);
      if (!cue) return;
      if (this.UsesDialoguePlayer(cue)) {
        const scene = this.dialogue.Play(this.BuildScene(cue), {
          Position: (line) => this.Position?.(cue, cue.lines[line.index]),
        });
        this.current = { cue, scene, phase: "playing", time: 0, sourceTime: 0, index: -1, parallel: [], events: new Set() };
        this.played.add(cue.id);
        return;
      }
      const total=this.Duration(cue);
      const plan=MissionVoiceTimeline(cue,total);
      const recorded=!!this.manifest.cues[cue.id];
      if(!recorded&&!this.missing.has(cue.id)){
        this.missing.add(cue.id);
        console.warn(`FirstLevelMissionVoice: no recording for ${cue.id}; subtitles run on the estimated length`);
      }
      this.current={cue,plan,total,time:0,index:-1,sourceTime:0,segmentIndex:0,recorded,
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
    const line=this.Speaker(current),position=this.Position?.(current.cue,line);
    if(this.audio.storyVoice) {
      if(this.audio.SetStoryVoiceSpeaker)this.audio.SetStoryVoiceSpeaker(this.audio.storyVoice,
        {position,firstPerson:line.who==="shunzi",who:line.who,speaking:spokenIndex>=0});
      else if(position)this.audio.MoveVoice?.(this.audio.storyVoice,position);
    }
    if(current.plan.parallel) {
      current.started=spokenIndex>=0&&spokenIndex!==current.index; current.index=spokenIndex;
      this.UpdateParallel(dt);this.ShowParallelSubtitles();
    } else if(index>=0 && current.sourceTime<segment.end && index!==current.index && current.cue.subtitles!==false){
      current.index=index;
      const line=current.cue.lines[index];
      this.hud.Say(Localize(FirstLevelCastTextId(line.who),MISSION_VOICE_CAST[line.who][0]),
        Localize(FirstLevelVoiceTextId(current.cue.id,index),MissionVoiceSubtitle(current.cue,index)),
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
  Speech(who) {
    if (this.paused || this.audio.voiceMute) return null;
    const line = this.dialogue.Speech(who, SampleSpeechEnvelope);
    if (line) return line;
    if (!this.current || this.current.scene) return null;
    for (const track of [this.current, ...(this.current.parallel || [])]) {
      if (track.finished || (track === this.current && track.phase !== "playing") || !track.voice
          || track.voice.reclaimed || track.voice.stopping) continue;
      if (track === this.current && this.audio.storyVoice !== track.voice) continue;
      const clock = this.Clock?.();
      const seconds = track.clock != null && Number.isFinite(clock)
        ? track.clockSource + Math.max(0, clock - track.clock) : track.sourceTime;
      const segment = track === this.current ? track.plan.segments[track.segmentIndex] : null;
      if (segment && seconds >= segment.end) continue;
      const index = track.plan.lines.findIndex(([start, end]) => seconds >= start && seconds < end);
      if (index < 0 || track.cue.lines[index]?.who !== who) continue;
      const envelope = this.audio.voiceBank?.get(`Mission${track.cue.id}`)?.speechEnvelope;
      if (!envelope) continue;
      return {active: true, who, cue: track.cue.id, sourceTime: seconds,
        ...SampleSpeechEnvelope(envelope, seconds)};
    }
    return null;
  }
  State() {
    return {
      loaded:this.loaded,paused:this.paused,available:Object.keys(this.manifest.cues).length,
      availableLines:Object.keys(this.manifest.lines||{}).length,dialogue:this.dialogue.State(),
      scenes:[...this.scenes.keys()],
      required:MISSION_DIALOGUE.length,played:[...this.played],finished:[...this.finished],
      missing:[...this.missing],unknown:[...this.unknown],
      current:this.current?.cue.id||null,queue:[...this.queue],errors:[...this.errors],
      segment:this.current?.plan?.segments[this.current.segmentIndex]?.id||null,
      playbackPhase:this.current?.phase||null,sourceTime:this.current?.sourceTime||0,
      parallel:(this.current?.parallel||[]).map(track=>({id:track.cue.id,sourceTime:track.sourceTime,
        total:track.total,finished:track.finished,speaker:track.index>=0?track.cue.lines[track.index].who:null})),
    };
  }
  Dispose() {
    this.StopParallel();
    this.audio.StopStoryVoice();
    this.dialogue.StopAll();
    this.scenes.clear();
    this.queue=[];
    this.current=null;
  }
}
