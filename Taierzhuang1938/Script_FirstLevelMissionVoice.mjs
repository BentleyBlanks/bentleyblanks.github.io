import { MISSION_DIALOGUE, MISSION_VOICE_CAST } from "./Data_FirstLevelMissionDialogue.mjs";
import { Localize } from "./Script_Text.mjs";
import { FirstLevelVoiceTextId, FirstLevelCastTextId } from "./Script_TextIds.mjs";
export class FirstLevelMissionVoice {
  constructor({ audio, hud, Position, Done }) {
    Object.assign(this, { audio, hud, Position, Done });
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
    if (urgent) this.queue.unshift(id);
    else this.queue.push(id);
    return true;
  }
  Finish() {
    if (!this.current) return;
    const id = this.current.cue.id;
    this.finished.add(id);
    this.current = null;
    this.Done?.(id);
  }
  Replay(id) {
    this.paused = false;
    this.played.delete(id);
    this.finished.delete(id);
    this.queue = this.queue.filter((cue) => cue !== id);
    this.Enqueue(id, { urgent: true });
  }
  Pause() {
    this.paused = true;
    this.audio.StopStoryVoice();
  }
  Resume() {
    if (!this.paused) return;
    this.paused = false;
    if (!this.current) return;
    const current = this.current;
    this.audio.PlayStoryVoice(`Mission${current.cue.id}`, {
      position: this.Position?.(current.cue),
      offset: current.time,
    });
    current.index = -1;
  }
  Update(dt) {
    if (this.paused) return;
    if (!this.current && this.queue.length) {
      const id = this.queue.shift(),
        cue = MISSION_DIALOGUE.find((cue) => cue.id === id);
      if (!cue) return;
      const played = this.audio.PlayStoryVoice(`Mission${cue.id}`, { position: this.Position?.(cue) });
      const total =
        played?.duration ||
        this.manifest.cues[cue.id]?.seconds ||
        cue.lines.reduce((sum, line) => sum + Math.max(1.1, line.text.length / 5.2), 0);
      this.current = {
        cue,
        time: 0,
        total,
        index: -1,
        weights: cue.lines.map((line) => Math.max(4, line.text.length)),
      };
      this.played.add(cue.id);
    }
    const current = this.current;
    if (!current) return;
    current.time += dt;
    const sum = current.weights.reduce((a, b) => a + b, 0),
      progress = current.time / current.total;
    let fraction = 0,
      index = current.weights.length - 1,
      start = 0,
      end = 1;
    for (let i = 0; i < current.weights.length; i++) {
      const next = fraction + current.weights[i] / sum;
      if (progress < next) {
        index = i;
        start = fraction;
        end = next;
        break;
      }
      fraction = next;
    }
    if (index !== current.index && current.cue.subtitles !== false) {
      current.index = index;
      const line = current.cue.lines[index];
      this.hud.Say(
        Localize(FirstLevelCastTextId(line.who), MISSION_VOICE_CAST[line.who][0]),
        Localize(FirstLevelVoiceTextId(current.cue.id, index), line.text),
        Math.max(0.5, end * current.total - current.time),
      );
    }
    if (current.time >= current.total) this.Finish();
  }
  State() {
    return {
      loaded: this.loaded,
      paused: this.paused,
      available: Object.keys(this.manifest.cues).length,
      required: MISSION_DIALOGUE.length,
      played: [...this.played],
      finished: [...this.finished],
      current: this.current?.cue.id || null,
      queue: [...this.queue],
      errors: [...this.errors],
    };
  }
  Dispose() {
    this.audio.StopStoryVoice();
    this.queue = [];
    this.current = null;
  }
}
