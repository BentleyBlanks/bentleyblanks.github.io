// Offline mouth tracks for dialogue (baked by Script_FirstLevelFaceTrackBake.py into
// Audio/FirstLevel/Data_FirstLevelFaceTracks.json). Pure module: no three, no DOM.
//
// A track is keyed by the sha256 of the mp3 it was baked from, so a re-recorded take
// never plays an old mouth. Time is the playback position inside that mp3 (the cue's
// source time for whole-cue takes, the line's own time for per-line takes).
//
//   await LoadFaceTracks()                  // once; later calls share the same promise
//   SampleFaceTrack(sha256, seconds)        // -> {jaw, wide, round, close, stress, line} | null
//   SampleLineFaceTrack(line, seconds)      // per-line player: line = {id, sha256?}; the
//                                           // injection point for dialogue.faceTrackSampler
//   FaceTrackSpeech(speech, sha256)         // envelope sample -> same sample + track channels
//
// `line` in a sample is the line index inside a whole-cue take, or the line id
// ("<Scene>.<NN>") of a per-line take, so a new line always reads as a line start.
//
// Channels are 0-1 weights of the Open / Wide / Round / Close face poses relative to
// Rest (Script_CharacterFacialAnimation). Between keys the value follows the same
// smoothstep the baker used for its statistics. `stress` is a triangular pulse
// FACE_TRACK_BAKE.stressPulseS wide around each stressed syllable; the face controller
// reacts to its rising edge through .5 (brows, head nod, blink).
import { FACE_TRACK_BAKE } from "./Data_Tuning_CharacterSpeech.mjs";

export const FACE_TRACKS_URL = new URL("./Audio/FirstLevel/Data_FirstLevelFaceTracks.json", import.meta.url).href;
export const FACE_TRACK_FORMAT = 1;

const tracks = new Map(); // sha256 -> compiled track
const lineTracks = new Map(); // "<Scene>.<NN>" -> sha256 of its per-line take (latest registered)
const loads = new Map();  // url -> Promise<number>

/** JSON track -> typed arrays (seconds, 0-1). */
export function CompileFaceTrack(track) {
  const flat = track.keys || [];
  const count = Math.floor(flat.length / 5);
  const times = new Float64Array(count), values = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    times[i] = flat[i * 5] / 1000;
    for (let c = 0; c < 4; c++) values[i * 4 + c] = flat[i * 5 + 1 + c] / 100;
  }
  const stress = Float64Array.from(track.stress || [], ms => ms / 1000);
  const lines = (track.lines || []).map(([start, end, who]) => ({ start: start / 1000, end: end / 1000, who }));
  return { id: track.id, kind: track.kind, who: track.who ?? null, seconds: track.seconds, times, values, stress, lines };
}

/** Add every track of a Data_FirstLevelFaceTracks.json body; returns how many. */
export function RegisterFaceTracks(body) {
  if (!body || body.format !== FACE_TRACK_FORMAT) throw new Error(`Face tracks: unsupported format ${body?.format}`);
  let count = 0;
  for (const [key, track] of Object.entries(body.tracks || {})) {
    tracks.set(key, CompileFaceTrack(track)); count++;
    if (track.kind === "line" && track.id) lineTracks.set(track.id, key);
  }
  return count;
}

/**
 * Fetch and register the baked tracks once per url. Failure leaves the envelope fallback.
 * Revalidated like the voice manifest (no-cache, 15 s timeout): a re-recorded take gets a
 * new sha256, and a stale cached file would silently drop every new mouth to the envelope.
 */
export function LoadFaceTracks(url = FACE_TRACKS_URL, fetchImpl = globalThis.fetch) {
  if (!loads.has(url)) {
    const signal = globalThis.AbortSignal?.timeout?.(15000);
    loads.set(url, Promise.resolve()
      .then(() => fetchImpl(url, { cache: "no-cache", ...(signal ? { signal } : {}) }))
      .then(response => { if (!response.ok) throw new Error(`Face tracks HTTP ${response.status}`); return response.json(); })
      .then(RegisterFaceTracks)
      .catch(error => { console.warn("[FaceTrack] not loaded, mouths use the voice envelope:", error?.message || error); return 0; }));
  }
  return loads.get(url);
}

export const HasFaceTrack = key => !!key && tracks.has(key);
export const FaceTrack = key => (key && tracks.get(key)) || null;
export const FaceTrackCount = () => tracks.size;
/** Test hook: forget every registered track and load. */
export function ClearFaceTracks() { tracks.clear(); lineTracks.clear(); loads.clear(); }

function Upper(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Channels at `seconds` into the take, or null when there is no track for `key`. */
export function SampleFaceTrack(key, seconds, out = {}) {
  const track = FaceTrack(key);
  if (!track || !Number.isFinite(seconds)) return null;
  const { times, values } = track;
  const i = Upper(times, seconds);
  out.jaw = out.wide = out.round = out.close = 0;
  if (i > 0 && i < times.length) {
    let u = (seconds - times[i - 1]) / Math.max(1e-6, times[i] - times[i - 1]);
    u = u * u * (3 - 2 * u);
    const a = (i - 1) * 4, b = i * 4;
    out.jaw = values[a] + (values[b] - values[a]) * u;
    out.wide = values[a + 1] + (values[b + 1] - values[a + 1]) * u;
    out.round = values[a + 2] + (values[b + 2] - values[a + 2]) * u;
    out.close = values[a + 3] + (values[b + 3] - values[a + 3]) * u;
  }
  const half = FACE_TRACK_BAKE.stressPulseS / 2;
  let stress = 0;
  const s = Upper(track.stress, seconds + half);
  for (let k = s - 1; k >= 0 && track.stress[k] >= seconds - half; k--) {
    stress = Math.max(stress, 1 - Math.abs(seconds - track.stress[k]) / half);
  }
  out.stress = stress;
  out.line = track.kind === "line" ? track.id : track.lines.findIndex(line => seconds >= line.start && seconds < line.end);
  return out;
}

/**
 * Per-line dialogue player hook: `line` is the player's line ({id, sha256?}). The take's
 * sha256 decides; without one the per-line track baked for that line id is used (the
 * baker prunes tracks whose take left Data_FirstLevelLineTimings.json).
 */
export function SampleLineFaceTrack(line, seconds) {
  const key = line?.sha256 || (line?.id != null ? lineTracks.get(line.id) : null);
  return key ? SampleFaceTrack(key, seconds) : null;
}

/**
 * A voice sample ({active, who, cue, sourceTime, level, brightness}) with the baked
 * channels merged in when `key` has a track. A sample that already carries a finite
 * jaw (the voice sampled the track itself) is returned unchanged.
 */
export function FaceTrackSpeech(speech, key, seconds = speech?.sourceTime) {
  if (!speech?.active || Number.isFinite(speech.jaw)) return speech;
  const sample = SampleFaceTrack(key, seconds);
  if (!sample) return speech;
  return { ...speech, ...sample, line: speech.line ?? sample.line };
}
