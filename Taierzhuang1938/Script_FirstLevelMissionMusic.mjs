import { FirstLevelMusicState, FIRST_LEVEL_MUSIC_COMBAT } from "./Data_FirstLevelMissionMusic.mjs";

// Only the mission selects a cue. The shared audio engine owns loading, loops and pause.
// 【2026-09-23】01–05 的战斗让位读引擎的战场强度；标点事实（facts.has）第一次出现的时刻
// 记在这里（事实表只是一个集合，不带时间）。
export class FirstLevelMissionMusic {
  constructor(audio) { this.audio = audio; this.current = null; this.stingerSeen = new Map(); this.stingerPrimed = false; }
  StingerAge(has) {
    if (typeof has !== "function") return Infinity;
    const now = this.audio.ctx?.currentTime ?? 0;
    let age = Infinity;
    // 【2026-09-24 审查后加】第一次看事实表时已经为真的事实（阶段跳转进 04/05、读档、
    // Debug.StartLevel）算「很久以前」—— 进场不该补一个并没发生的标点。之后由假变真的才起标点。
    const primed = this.stingerPrimed;
    this.stingerPrimed = true;
    for (const id of FIRST_LEVEL_MUSIC_COMBAT.stingers) {
      if (!has(id)) { this.stingerSeen.delete(id); continue; }
      if (!this.stingerSeen.has(id)) this.stingerSeen.set(id, primed ? now : -Infinity);
      age = Math.min(age, now - this.stingerSeen.get(id));
    }
    return age;
  }
  Update(stage, facts = {}) {
    const next = FirstLevelMusicState(stage, { ...facts,
      intensity: facts.intensity ?? this.audio.battleIntensity ?? 0, stingerAgeS: this.StingerAge(facts.has) });
    if (!this.current || next.cue !== this.current.cue) this.audio.Music(next.cue, {
      fadeOut: next.fadeOut, levelScale: next.scale,
    });
    else if (next.scale !== this.current.scale) this.audio.SetMusicLevel(next.scale, next.rampS);
    this.current = next;
  }
  State() {
    return { ...this.current, playing: !!this.audio.musicLayer,
      loaded: !!this.current?.cue && this.audio.musicBuffers?.has(this.current.cue) };
  }
  Dispose() { this.audio.Music(null, { fadeOut: 0 }); this.current = null; }
}
