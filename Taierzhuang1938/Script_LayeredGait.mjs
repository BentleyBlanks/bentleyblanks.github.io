// Layered blend per bone for load/injury clips (docs/Data_ActorLocomotion.md §分层步态).
//
// The video-mocap stretcher and limp clips shuffle almost in place: the front bearer's planted
// foot travels 0.54 m/s, the rear bearer's walks BACKWARDS at 0.33 m/s, the limp nets ~0. No
// playback rate turns them into the 1.1-1.4 m/s the escort actually moves, so the feet slid (or
// moonwalked) the whole way. While travelling, the pelvis and legs now come from the measured walk
// cycle on the same TengxianHumanoidV1 skeleton (AllyCarryWalk: 1.35 m/s, contact spans), and
// everything above the pelvis from the original clip, time-scaled onto the walk's period so its
// bob keeps the steps' rhythm. Standing still keeps the original clip.
import { AnimationClip } from 'three';
import { LoadAllyGait } from './Script_AllyGait.mjs';

const WALK = 'AllyCarryWalk';
export const LAYERED_GAIT_SOURCES = Object.freeze(['CarryStretcherFront', 'CarryStretcherRear', 'WoundedLimp']);
const LOWER = /^(GroundRoot|Bip001_Pelvis|Bip001_[LR]_(Thigh|Calf|Foot|Toe0))\./;
const Layered = id => id + 'Walk';
let library = null, loading = null;
const built = new WeakMap();

function Load() {
  loading ||= LoadAllyGait().then(data => {
    const json = data.clips.find(clip => clip.name === WALK);
    const walk = AnimationClip.parse(json);
    library = { walk, lower: walk.tracks.filter(track => LOWER.test(track.name)), profile: data.profiles[WALK] };
  }).catch(error => { loading = null; console.warn('[LayeredGait]', error); });
  return loading;
}

function Build(source) {
  let clip = built.get(source);
  if (clip) return clip;
  const scale = library.walk.duration / source.duration;
  const upper = source.tracks.filter(track => !LOWER.test(track.name)).map(track => {
    const copy = track.clone();
    for (let i = 0; i < copy.times.length; i++) copy.times[i] *= scale;
    return copy;
  });
  clip = new AnimationClip(Layered(source.name), library.walk.duration, [...library.lower.map(track => track.clone()), ...upper]);
  built.set(source, clip);
  return clip;
}

/**
 * The clip to play for a load/injury gait: the layered walk while moving (once the walk library is
 * in), else the source clip. Installs lazily per rig; the rig's locomotion profile gets the walk's
 * measured speed and contacts, so the shared distance clock drives it like any gait.
 */
export function LayeredGaitId(rig, id, moving) {
  if (!moving || !LAYERED_GAIT_SOURCES.includes(id)) return id;
  if (!library) { Load(); return id; }
  const layered = Layered(id);
  if (!rig.clipById.has(layered)) {
    const source = rig.clipById.get(id);
    if (!source || !rig.locomotion) return id;
    rig.clipById.set(layered, Build(source));
    rig.locomotion.profiles = { ...rig.locomotion.profiles, [layered]: library.profile };
  }
  return layered;
}

export const LayeredGaitReady = () => (library ? Promise.resolve() : Load());
