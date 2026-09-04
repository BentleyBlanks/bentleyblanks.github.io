// Pure arrival controller. Never moves a player, replaces a cast, or owns a camera.
// Host contract:
// GuideArrival() continuously guides EXISTING Luo to the existing door; NearDoor()
// is actual arrival, not a timer. SetDoorProgress(p) synchronizes dynamic panel and
// collider: keep passage blocked below 1; at 1 clear both, only then DoorOpen=true.
// ReleaseColumn() permits the existing finite queues, without reinitializing them.
// StartAudio(cue) returns an owned handle; StopAudio(handle) must stop ONLY that
// handle. PlaySfx(cue) is existing SFX only. Subtitle(text) never routes to voice.
// RenderArrival receives view/steam/brake envelope; no train body translation.
import { P012_ARRIVAL } from './Data_FirstLevelP012Arrival.mjs';
const phases = ['idle', 'braking', 'guide', 'door', 'blackout', 'complete'];
function Clamp(value, max = 1) { return Math.max(0, Math.min(max, Number(value) || 0)); }
export class FirstLevelP012Arrival {
  constructor(host = {}, config = P012_ARRIVAL) {
    this.host = host; this.config = config; this.audioHandle = null;
    this.phase = 'idle'; this.elapsed = 0; this.skipped = false; this.released = false;
  }
  Start() {
    if (this.phase !== 'idle') return false;
    this.phase = 'braking'; this.StartAudio(); this.host.Subtitle?.(this.config.muster);
    this.host.PlaySfx?.(this.config.audio.brake); this.Render(); return true;
  }
  StartAudio() {
    if (this.audioHandle === null) this.audioHandle = this.host.StartAudio?.(this.config.audio.bed) ?? null;
  }
  StopAudio() {
    if (this.audioHandle !== null) this.host.StopAudio?.(this.audioHandle);
    this.audioHandle = null;
  }
  Enter(phase) {
    this.phase = phase; this.elapsed = 0;
    if (phase === 'door') {
      this.host.Subtitle?.(this.config.follow); this.host.PlaySfx?.(this.config.audio.door);
    }
    if (phase === 'complete' && !this.released) {
      // Render fully open geometry before exposing passage to any queue.
      this.host.SetDoorProgress?.(1); this.released = true; this.host.ReleaseColumn?.();
    }
  }
  Update(dt) {
    if (this.phase === 'idle') return this.View();
    // Deliberately do not consume a huge background-tab delta across several
    // beats: returning to the tab cannot silently swallow the opening action.
    this.elapsed += Clamp(dt, .25);
    if (this.phase === 'braking' && (this.skipped || this.elapsed >= this.config.brakeSeconds)) this.Enter('guide');
    if (this.phase === 'guide') {
      this.host.GuideArrival?.();
      if (this.host.NearDoor?.() === true) this.Enter('door');
    } else if (this.phase === 'door' && this.elapsed >= this.config.doorSeconds) this.Enter(this.skipped ? 'complete' : 'blackout');
    else if (this.phase === 'blackout' && (this.skipped || this.elapsed >= this.config.blackoutSeconds)) this.Enter('complete');
    if (this.phase === 'complete' && this.elapsed >= this.config.titleSeconds) this.StopAudio();
    this.Render(); return this.View();
  }
  Skip() {
    if (this.phase === 'idle') this.Start();
    this.skipped = true;
    // The real guide and the visible door action remain mandatory.
    this.Update(0); return this.Snapshot();
  }
  View() {
    const c = this.config, p = this.phase;
    const doorProgress = p === 'door' ? Clamp(this.elapsed / c.doorSeconds) : ['blackout', 'complete'].includes(p) ? 1 : 0;
    const u = p === 'blackout' ? Clamp(this.elapsed / c.blackoutSeconds) : 0;
    const fade = p === 'blackout' ? Math.min(1, u / .2, (1 - u) / .2) : 0;
    const titleVisible = p === 'blackout' || (p === 'complete' && !this.skipped && this.elapsed < c.titleSeconds);
    return { phase: p, doorProgress, fade, title: titleVisible ? c.title : '', date: titleVisible ? c.date : '',
      deceleration: p === 'braking' ? 1 - Clamp(this.elapsed / c.brakeSeconds) : 0,
      steam: p === 'idle' ? 0 : p === 'complete' ? .25 * (1 - Clamp(this.elapsed / c.titleSeconds)) : .65,
      canDisembark: this.released, controlsLocked: false };
  }
  Render() { const view = this.View(); this.host.SetDoorProgress?.(view.doorProgress); this.host.RenderArrival?.(view); }
  Snapshot() { return { version: 1, phase: this.phase, elapsed: this.elapsed, skipped: this.skipped }; }
  Restore(snapshot) {
    this.StopAudio();
    this.phase = snapshot?.version === 1 && phases.includes(snapshot.phase) ? snapshot.phase : 'idle';
    this.elapsed = Clamp(snapshot?.elapsed, 3600); this.skipped = snapshot?.skipped === true;
    this.released = this.phase === 'complete';
    // Restoring synchronizes facts but never replays subtitles, one-shots or the
    // one-time ReleaseColumn callback. Host restores its queue snapshot itself.
    if (!['idle', 'complete'].includes(this.phase) || (this.phase === 'complete' && this.elapsed < this.config.titleSeconds)) this.StartAudio();
    this.Render(); return this.View();
  }
  Dispose() {
    this.StopAudio(); this.phase = 'idle'; this.elapsed = 0; this.skipped = false; this.released = false;
    this.host.RenderArrival?.(this.View());
  }
}
