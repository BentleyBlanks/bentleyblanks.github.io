// Locomotion profile of RifleHoldRun, measured the way the production profiles are (Script_LocomotionProfileBake.mjs):
// the toe joints of the shipped NRA02 skeleton at 120 Hz, a stance is "toe joint within 3.5 cm of its floor and travelling
// back faster than 0.12 m/s" for longer than 75 ms, and the reference speed is the median stance toe speed (model units/s,
// which ActorLocomotion multiplies by the actor's hierarchy scale). Written into profiles.RifleHoldRun of the clip JSON,
// next to the design values the Blender bake wrote (designReferenceMps in runtime metres, designContacts).
//   node Taierzhuang1938/_import/Script_RifleHoldRunProfile.mjs            # measure and write
//   node Taierzhuang1938/_import/Script_RifleHoldRunProfile.mjs --verify   # fail if the file's profile is stale
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LoadGlb, PoseScene } from './Script_LugouGlbPose.mjs';

const project = path.resolve(import.meta.dirname, '..');
export const clipFile = path.join(project, 'Animation/RifleHoldRun/Animation_TengxianRifleHoldRun.json');
const Round = v => +v.toFixed(6);
const Median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** { duration, referenceMps, contacts } for the clip of `data` (a parsed Animation_TengxianRifleHoldRun.json). */
export function MeasureProfile(data) {
  const clip = data.clips[0];
  const scene = new PoseScene(LoadGlb(path.join(project, 'Model/Character/Model_TengxianNra02.glb')));
  const index = new Map(scene.nodes.map((n, i) => [n.name.replace(/\s/g, '_'), i]));
  scene.animations.push({
    name: clip.name, duration: clip.duration,
    channels: clip.tracks.filter(t => !t.name.startsWith(data.weaponTrack + '.')).map(track => {
      const [name, property] = track.name.split('.');
      return { node: index.get(name), path: property === 'quaternion' ? 'rotation' : 'translation', width: property === 'quaternion' ? 4 : 3,
        input: track.times, output: track.values, interpolation: 'LINEAR' };
    }),
  });
  const id = scene.animations.length - 1, duration = clip.duration;
  const count = Math.ceil(duration * 120), step = duration / count, frames = [];
  const nodes = ['L', 'R'].map(side => scene.FindNode(new RegExp(` ${side} Toe0$`)));
  for (let i = 0; i <= count; i++) {
    scene.Apply(id, i * step);
    frames.push(nodes.map(node => Array.from(scene.world[node].slice(12, 15))));
  }
  const contacts = {}, speeds = [];
  for (const [sideIndex, side] of ['L', 'R'].entries()) {
    const floor = Math.min(...frames.map(frame => frame[sideIndex][1]));
    const stance = frames.map((frame, i) => {
      const lo = Math.max(0, i - 1), hi = Math.min(count, i + 1);
      const velocity = -(frames[hi][sideIndex][2] - frames[lo][sideIndex][2]) / ((hi - lo) * step);
      const grounded = frame[sideIndex][1] < floor + .035 && velocity > .12;
      if (grounded) speeds.push(velocity);
      return grounded;
    });
    contacts[side] = [];
    for (let start = 0; start < count; start++) {
      if (!stance[start]) continue;
      let end = start + 1; while (end < count && stance[end]) end++;
      if ((end - start) * step > .075) contacts[side].push([Round(start / count), Round(end / count)]);
      start = end;
    }
  }
  if (!speeds.length || !contacts.L.length || !contacts.R.length) throw new Error('RifleHoldRun: no measured stance');
  return { duration: Round(duration), referenceMps: Round(Median(speeds)), contacts };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = JSON.parse(fs.readFileSync(clipFile, 'utf8'));
  const measured = MeasureProfile(data);
  const profile = data.profiles.RifleHoldRun;
  if (process.argv.includes('--verify')) {
    for (const key of ['duration', 'referenceMps', 'contacts'])
      if (JSON.stringify(profile[key]) !== JSON.stringify(measured[key])) throw new Error(`RifleHoldRun profile.${key} is stale; run Script_RifleHoldRunProfile.mjs`);
    console.log('RifleHoldRun profile verify OK');
  } else {
    Object.assign(profile, measured, { measuredBy: '_import/Script_RifleHoldRunProfile.mjs (rule of _import/Script_LocomotionProfileBake.mjs, 120 Hz toe joints, model units)' });
    fs.writeFileSync(clipFile, JSON.stringify(data));
    console.log(JSON.stringify({ referenceMps: measured.referenceMps, contacts: measured.contacts, designReferenceMps: profile.designReferenceMps }));
  }
}
