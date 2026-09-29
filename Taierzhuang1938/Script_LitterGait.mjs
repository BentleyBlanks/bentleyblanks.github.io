// Per-litter walking character for a stretcher column: own stride, slow pace drift, short
// stops, a loose lane. Pure numbers, no Three.js; the column owns positions and safety.
// State is plain data (the random stream is one uint32) so column snapshots stay cloneable.
import { LITTER_GAIT as G } from "./Data_Tuning_SquadMarch.mjs";

const Clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function Hash(text) {
  let value = 2166136261;
  for (const ch of String(text)) value = Math.imul(value ^ ch.charCodeAt(0), 16777619) >>> 0;
  return value;
}
function Roll(g) {
  g.s = (g.s + 0x6D2B79F5) >>> 0;
  let t = g.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const Range = (g, a, b) => a + Roll(g) * (b - a);

export function LitterGaitCreate(id, index, T = G) {
  const g = { s: Hash(`litter:${id}`) };
  g.stride = Range(g, T.strideMin, T.strideMax);
  g.wobbleHz = Range(g, T.wobbleHzMin, T.wobbleHzMax);
  g.wobblePhase = Roll(g) * Math.PI * 2;
  g.gapBase = Roll(g) * T.gapJitterM;
  g.gapHz = Range(g, T.gapHzMin, T.gapHzMax);
  g.gapPhase = Roll(g) * Math.PI * 2;
  // Neighbouring teams take opposite sides of the road centre, so the file zig-zags a little.
  g.laneBase = (index % 2 ? 1 : -1) * Range(g, T.laneMinM, T.laneMaxM);
  g.laneHz = Range(g, T.laneHzMin, T.laneHzMax);
  g.lanePhase = Roll(g) * Math.PI * 2;
  const first = T.runMinS * T.firstRunScale;
  g.phase = "walk";
  g.runLeft = Range(g, first, T.runMaxS);
  g.pauseLeft = 0;
  g.reactLeft = 0;
  g.blockedS = 0;
  g.speed = 0;
  g.at = -Infinity;
  g.lastStop = -Infinity;
  g.stops = 0;
  return g;
}

/** Extra gap kept behind the team in front, on top of R.litterSpacingM. Never negative. */
export function LitterGaitGap(g, time, T = G) {
  return Math.max(0, g.gapBase + T.gapBreatheM * (1 + Math.sin(time * g.gapHz * Math.PI * 2 + g.gapPhase)) * .5);
}

/** Sideways offset from the road centre line (metres, right-hand positive along the route). */
export function LitterGaitLane(g, time, envelope = 1, T = G) {
  const sway = g.laneBase + T.laneSwayM * Math.sin(time * g.laneHz * Math.PI * 2 + g.lanePhase);
  return Clamp(sway, -T.laneLimitM, T.laneLimitM) * Clamp(envelope, 0, 1);
}

/**
 * One frame. `c`:
 *   time      column clock
 *   wantMove  the column would let this team advance (safe, not held by the queue)
 *   base      wanted speed before personal scaling (already includes the one-bearer drag)
 *   room      route metres left before the queue / gate / player limit
 *   canPause  standing still here is fine (not at the gate, not at a narrow place)
 *   peers     the other teams' gaits, for the density rule
 * Returns the speed to advance at this frame (m/s).
 */
export function LitterGaitStep(g, dt, c, T = G) {
  if (c.time - g.at > T.staleS) { g.speed = 0; g.blockedS = 0; g.reactLeft = 0; }
  g.at = c.time;
  if (!c.wantMove) g.blockedS += dt;
  else {
    // Held up by the team ahead for a while: the men take a moment to notice and set off.
    if (g.blockedS >= T.reactBlockedS) g.reactLeft = Range(g, T.reactMinS, T.reactMaxS);
    g.blockedS = 0;
  }
  if (g.phase === "walk") {
    if (c.wantMove && g.speed > T.movingMps) g.runLeft -= dt;
    if (g.runLeft <= 0) {
      const peers = c.peers || [];
      const stopped = peers.filter(p => p.phase === "pause").length;
      const last = Math.max(-Infinity, ...peers.map(p => p.lastStop));
      const limit = Math.max(1, Math.floor((peers.length + 1) * T.restFraction));
      if (c.canPause && stopped < limit && c.time - last >= T.stopGapS) {
        g.phase = "pause";
        g.pauseLeft = Range(g, T.pauseMinS, T.pauseMaxS);
        g.lastStop = c.time;
        g.stops++;
      } else g.runLeft = Range(g, T.retryMinS, T.retryMaxS);
    }
  } else {
    g.pauseLeft -= dt;
    if (g.pauseLeft <= 0) { g.phase = "walk"; g.runLeft = Range(g, T.runMinS, T.runMaxS); }
  }
  if (g.reactLeft > 0 && c.wantMove) g.reactLeft -= dt;
  let wanted = c.base * g.stride * (1 + T.wobbleAmp * Math.sin(c.time * g.wobbleHz * Math.PI * 2 + g.wobblePhase));
  if (g.phase === "pause" || g.reactLeft > 0 || !c.wantMove) wanted = 0;
  wanted = Math.min(wanted, Math.sqrt(Math.max(0, 2 * T.decelMps2 * (c.room - T.brakeMarginM))));
  g.speed += Clamp(wanted - g.speed, -T.decelMps2 * dt, T.accelMps2 * dt);
  return g.speed;
}
