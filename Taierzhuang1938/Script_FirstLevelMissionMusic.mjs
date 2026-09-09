import { FirstLevelMusicState } from "./Data_FirstLevelMissionMusic.mjs";

// Only the mission selects a cue. The shared audio engine owns loading, loops and pause.
export class FirstLevelMissionMusic {
  constructor(audio) { this.audio = audio; this.current = null; }
  Update(stage, facts) {
    const next = FirstLevelMusicState(stage, facts);
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
