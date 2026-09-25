// 01–02 lens post-processing, storyboard round (contract docs/Data_FirstLevelStoryboard0103Contract.md §4.4).
// Pure logic (no three, runs under node for Script_OpeningLensTest):
//   Evaluate(phase, age, events) → lens | null   one look sampled at one moment (null outside 01–02);
//   OpeningLensDriver.Sample(now, phase, age, events) → lens | null   the same with the crossfade between
//     looks (called by FirstLevelMissionRuntime.Perception, idempotent within one `now`);
//   ApplyLensToPost(params, lens) → params   Script_Main's post parameters with the lens laid over them
//     (lens null: the object is returned untouched — nothing of 01–02 survives outside it).
// Looks and curves live in Data_OpeningLens. The flash and the mud are HUD layers (Script_Hud.SetLens).
//
// events = { now, blastAt, impactAt?, buttHit, clearAt, concussion } — times on the mission clock (r.time); any
// may be missing (the channel then shows its `before` value; a phase that runs on without the event it waits
// for says so once on the console, see EVENT_WAITS). Debug: Tengxian.Debug.OpeningLens.Force(look, age).
import { LENS_DEFAULT, LOOKS, PHASE_LOOKS, LOOK_BLEND_S, SHELL_FLIGHT_S } from "./Data_OpeningLens.mjs";

const Clamp01 = v => Math.max(0, Math.min(1, v));
const Smooth = t => { const x = Clamp01(t); return x * x * (3 - 2 * x); };
const Lerp = (a, b, t) => a + (b - a) * t;
// A lens sampled longer ago than this is not a crossfade source.
const STALE_S = 0.25;
// The phase whose look waits on an event, and how long into the phase that event is overdue (s): Blast's
// near miss starts with the phase; Butt's hold before the strike is ≥ 0.4 s (contract §4.2) and the strike
// comes well inside 8 s; Found waits for ijaA to walk up (well under 15 s). Past that the look is stuck on its
// `before` value — a renamed or retimed director event — and the driver warns once.
export const EVENT_WAITS = Object.freeze({ Blast: Object.freeze(["blastAt", 1]), Butt: Object.freeze(["buttHit", 8]), Found: Object.freeze(["clearAt", 15]) });

/** Linear through [[t, v], ...], held past both ends. */
export function SampleKeys(keys, t) {
  if (!keys?.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; return t1 > t0 ? Lerp(v0, v1, (t - t0) / (t1 - t0)) : v1; }
  }
  return keys[keys.length - 1][1];
}

/** Seconds on each clock (null = that event has not happened). */
function Clocks(age, events = {}) {
  const now = events.now, Since = at => (now != null && at != null && now >= at ? now - at : null);
  const impactAt = events.impactAt ?? (events.blastAt != null ? events.blastAt + SHELL_FLIGHT_S : null);
  return { phase: age ?? 0, blast: Since(events.blastAt), impact: Since(impactAt), buttHit: Since(events.buttHit), clearAt: Since(events.clearAt) };
}

function Channel(spec, fallback, clocks, events) {
  if (spec == null) return fallback;
  if (typeof spec === "number") return spec;
  const t = clocks[spec.clock];
  let value = t == null ? (spec.before ?? spec.keys[0][1]) : SampleKeys(spec.keys, t);
  if (spec.byConcussion && Number.isFinite(events?.concussion)) value *= Clamp01(events.concussion / spec.byConcussion);
  return value;
}

/** A named look sampled at (phase age, events). Throws on an unknown look. */
export function EvaluateLook(name, age = 0, events = {}) {
  const look = LOOKS[name];
  if (!look) throw new Error(`OpeningLens: unknown look ${name}`);
  const c = Clocks(age, events), D = LENS_DEFAULT, Ch = (spec, fb) => Channel(spec, fb, c, events);
  const Dof = (spec, d) => ({ strength: Ch(spec?.strength, d.strength), focusM: Ch(spec?.focusM, d.focusM),
    rangeM: Ch(spec?.rangeM, d.rangeM), maxPx: Ch(spec?.maxPx, d.maxPx) });
  const b = look.bloodEdge;
  return {
    look: name,
    aberration: Ch(look.aberration, D.aberration),
    vignette: Ch(look.vignette, D.vignette),
    bloodEdge: { strength: Ch(b?.strength, D.bloodEdge.strength), tint: [...(b?.tint || D.bloodEdge.tint)],
      corners: [...(b?.corners || D.bloodEdge.corners)] },
    radialBlur: Ch(look.radialBlur, D.radialBlur),
    dofNear: Dof(look.dofNear, D.dofNear),
    dofFar: Dof(look.dofFar, D.dofFar),
    flash: Clamp01(Ch(look.flash, D.flash)),
    mud: Clamp01(Ch(look.mud, D.mud)),
    desaturate: Clamp01(Ch(look.desaturate, D.desaturate)),
    darken: Clamp01(Ch(look.darken, D.darken)),
    storyBloodCap: Clamp01(Ch(look.storyBloodCap, D.storyBloodCap)),
  };
}

/** The look a director phase uses, or null outside 01–02. */
export function LookForPhase(phase) { return (phase && PHASE_LOOKS[phase]) || null; }

/** Contract §4.4: one phase at one moment → lens (no crossfade), null outside 01–02. */
export function Evaluate(phase, age = 0, events = {}) {
  const name = LookForPhase(phase);
  return name ? EvaluateLook(name, age, events) : null;
}

/** a→b at t (numbers, arrays, nested DOF/blood objects). `look` follows b. */
export function BlendLens(a, b, t) {
  if (!a || t >= 1) return b;
  const Mix = (x, y) => Array.isArray(y) ? y.map((v, i) => Lerp(x[i], v, t))
    : typeof y === "object" && y ? Object.fromEntries(Object.entries(y).map(([k, v]) => [k, Mix(x[k], v)]))
      : typeof y === "number" ? Lerp(x, y, t) : y;
  const out = Mix(a, b);
  out.look = b.look;
  return out;
}

/**
 * Per-frame lens with crossfades between looks (the look's blendInS from whatever was on screen). Outside
 * 01–02 (phase null or unknown) it returns null at once and forgets the last look — no residue carries into
 * 03. A forced look (debug bench) wins over the phase.
 */
export class OpeningLensDriver {
  constructor() {
    this.look = null; this.since = 0; this.from = null; this.last = null; this.lastNow = null; this.forced = null; this.enabled = true;
    this.warnings = []; this.warned = new Set();
    this.Attach();
  }
  /** (Re)hang the bench on Tengxian.Debug — the page may build its Debug table after the runtime. */
  Attach() {
    const debug = globalThis.Tengxian?.Debug;
    if (!debug || debug.OpeningLens?.driver === this) return;
    debug.OpeningLens = {
      driver: this,
      Force: (look, age = 0, events = {}) => this.Force(look, age, events),
      Clear: () => this.Force(null),
      // A/B bench (frame time, screenshots): false = lens off (null) even inside 01–02.
      Enable: (on = true) => { this.enabled = on !== false; this.lastNow = null; return this.enabled; },
      State: () => this.last,
      Looks: () => Object.keys(LOOKS),
    };
  }
  /** Hold one look at a fixed age (every event `age` s ago, concussion 1 unless given); null clears. */
  Force(look, age = 0, events = {}) {
    if (look == null) { this.forced = null; return true; }
    if (!LOOKS[look]) throw new Error(`OpeningLens.Force: unknown look ${look}`);
    this.forced = { look, age, events };
    return true;
  }
  Sample(now, phase, age, events = {}) {
    this.Attach();
    if (!this.enabled) return (this.last = null);
    if (this.forced) {
      const f = this.forced, at = 0 - f.age;
      const lens = EvaluateLook(f.look, f.age, { now: 0, blastAt: at, buttHit: at, clearAt: at, concussion: 1, ...f.events });
      lens.forced = true;
      return (this.last = lens);
    }
    if (now === this.lastNow && this.lastPhase === phase) return this.last;
    this.lastNow = now; this.lastPhase = phase;
    const name = LookForPhase(phase);
    if (!name) { this.look = null; this.from = null; return (this.last = null); }
    const wait = EVENT_WAITS[phase];
    if (wait && (age ?? 0) > wait[1] && events[wait[0]] == null && !this.warned.has(phase)) {
      this.warned.add(phase);
      const message = `[OpeningLens] ${phase} has run ${(age ?? 0).toFixed(1)} s without ${wait[0]}: the ${name} look holds its before value`;
      this.warnings.push(message); console.warn(message);
    }
    // Crossfade only from what was really on screen a moment ago (a stale snapshot — frames stepped without
    // rendering, a paused tab — would drag an old look into the new one).
    const fresh = this.last && !this.last.forced && this.lastSampleAt != null && now - this.lastSampleAt <= STALE_S;
    if (name !== this.look) { this.from = fresh ? this.last : null; this.look = name; this.since = now; }
    this.lastSampleAt = now;
    const target = EvaluateLook(name, age, { now, ...events });
    const blendS = LOOKS[name].blendInS ?? LOOK_BLEND_S;
    const t = blendS > 0 ? Smooth((now - this.since) / blendS) : 1;
    const lens = this.from ? BlendLens(this.from, target, t) : target;
    if (t >= 1) this.from = null;
    return (this.last = lens);
  }
}

/**
 * Lay a lens over Script_Main's post parameters. Absolute channels replace (aberration, radial blur, blood
 * edge, the DOFs when the lens asks for them); vignette scales the caller's own value by lens/default so the
 * graphics setting and suppression still apply; darken scales exposure, desaturate scales saturation.
 * Never touches params when lens is null.
 */
export function ApplyLensToPost(params, lens) {
  if (!lens) return params;
  const D = LENS_DEFAULT;
  params.aberration = lens.aberration;
  params.vignette = (params.vignette ?? D.vignette) * (lens.vignette / D.vignette);
  params.radialBlur = lens.radialBlur;
  params.bloodEdge = lens.bloodEdge;
  if (lens.darken > 0) params.exposure = (params.exposure ?? 1) * (1 - lens.darken);
  if (lens.desaturate > 0) params.saturation = (params.saturation ?? 0.94) * (1 - lens.desaturate);
  const far = lens.dofFar;
  if (far?.strength > (params.dofStrength ?? 0)) {
    params.dofStrength = far.strength; params.dofFocus = far.focusM; params.dofRange = far.rangeM; params.dofMaxPx = far.maxPx;
  }
  const near = lens.dofNear;
  if (near?.strength > (params.nearDofStrength ?? 0)) {
    params.nearDofStrength = near.strength; params.nearDofFocus = near.focusM; params.nearDofRange = near.rangeM;
    params.nearDofMaxPx = near.maxPx; params.nearDofSightUv = null;
  }
  return params;
}
