import { FIRE_CONTROL, RELOAD_EVENTS } from "./Data_Tuning_FirearmActions.mjs";
import { WALL_CARRY } from "./Data_Tuning_FirearmHandling.mjs";

// Retain sub-frame overshoot only during uninterrupted automatic fire.
// A fresh pull or a blocked action starts a fresh interval, never a backlog.
export class FirearmCadence {
  constructor() { this.Reset(); }
  Reset() { this.remainingS = 0; this.active = false; this.previousActive = false; }
  Step(dt) {
    this.remainingS = Math.max(-dt, this.remainingS - dt);
    this.previousActive = this.active;
    this.active = false;
  }
  Ready() { this.active = true; return this.remainingS <= FIRE_CONTROL.timerEpsilonS; }
  Fired(intervalS, fresh = false) {
    this.remainingS = intervalS + (!fresh && this.previousActive ? Math.min(0, this.remainingS) : 0);
  }
}

// A deliberate counter-steer consumes the recoil it has already corrected.
// Recovery must not apply that same correction a second time on trigger release.
export function RecoilAfterInput(pending, delta) {
  if (pending * delta >= 0) return pending;
  return Math.sign(pending) * Math.max(0, Math.abs(pending) - Math.abs(delta));
}

export function GunReadyFromCover(clearance, visualLower = 0) {
  return !clearance?.blocked
    && Math.max(clearance?.lower || 0, visualLower) <= WALL_CARRY.fireReadyLower;
}

// Callbacks are driven by crossings, so slow frames cannot skip a mechanical
// event, and repeated evaluation / completion cannot duplicate ammo or sounds.
export class FirearmReloadTimeline {
  constructor(weapon, action = {}) {
    const kind=weapon?.reloadKind==="enBloc"&&action.packetRounds>0?"enBlocPartial":weapon?.reloadKind;
    this.events = RELOAD_EVENTS[kind] || RELOAD_EVENTS.stripper;
    if(action.startedOpen)this.events=this.events.filter(event=>event.id!=="open");
    this.next = 0;
  }
  Advance(normalized, emit) {
    while (this.next < this.events.length
      && this.events[this.next].at <= normalized + FIRE_CONTROL.timerEpsilonS) {
      emit?.(this.events[this.next++]);
    }
  }
}
