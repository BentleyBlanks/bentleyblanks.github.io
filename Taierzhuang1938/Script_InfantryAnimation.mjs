// Playback policy for the contact-corrected Seedance/GVHMR infantry clips.
// Displacement stays with Actor/AI; only the gait clock follows actual travel speed.
export const INFANTRY_ANIMATION_LABELS = Object.freeze({
  RifleCrouchAdvance: '持枪低姿前进（视频转骨骼）',
  StandToKneel: '站立转单膝跪地（视频转骨骼）',
  KneelHold: '单膝跪地警戒（视频转骨骼）',
  KneelToStand: '单膝跪地起身（视频转骨骼）',
  GrenadeThrow: '背枪投弹（视频转骨骼）',
});
export const INFANTRY_ANIMATION_IDS = Object.freeze(Object.keys(INFANTRY_ANIMATION_LABELS));
export const INFANTRY_ONCE_IDS = Object.freeze(['StandToKneel', 'KneelToStand', 'GrenadeThrow']);
export const INFANTRY_RELEASE_SECONDS = 2.15;

export class InfantryAnimationController {
  constructor(rig) {
    this.rig = rig;
    this.throwSignal = false;
    this.throwPending = false;
    this.releaseSerial = 0;
    this.released = false;
  }

  BeginFrame(state) {
    const signal = (state.throwing || 0) > .08;
    if (!this.IsThrowing() && ((signal && !this.throwSignal) || this.rig.actor?.pendingGrenadeThrow)) this.throwPending = true;
    this.throwSignal = signal;
  }

  IsThrowing() { return this.rig.currentId === 'GrenadeThrow' && !this.Finished(); }
  Finished() {
    const action = this.rig.currentAction;
    return !action || action.time >= action.getClip().duration - 1e-5;
  }
  Cancel() { this.throwPending = false; }

  Select(low, moving) {
    const id = this.rig.currentId;
    if (low) {
      this.throwPending = false;
      if (moving) return 'RifleCrouchAdvance';
      if (id === 'StandToKneel') return this.Finished() ? 'KneelHold' : id;
      if (id === 'KneelHold' || id === 'RifleCrouchAdvance') return 'KneelHold';
      return 'StandToKneel';
    }
    if (!moving) {
      if (id === 'KneelHold' || id === 'StandToKneel') return 'KneelToStand';
      if (id === 'KneelToStand' && !this.Finished()) return id;
    }
    if (id === 'GrenadeThrow' && !this.Finished()) return id;
    if (this.throwPending) {
      this.throwPending = false; this.released = false;
      return 'GrenadeThrow';
    }
    return null;
  }

  AfterUpdate(previousId, previousTime) {
    if (this.rig.currentId !== 'GrenadeThrow') return;
    if (previousId !== 'GrenadeThrow') this.released = false;
    const time = this.rig.currentAction.time;
    if (!this.released && time >= INFANTRY_RELEASE_SECONDS
        && (previousId !== 'GrenadeThrow' || previousTime < INFANTRY_RELEASE_SECONDS)) {
      this.released = true; this.releaseSerial++;
    }
  }
}
