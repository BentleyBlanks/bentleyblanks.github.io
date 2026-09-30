// Writes the browser-measured floors into the DeathImpact profiles.
//
//   node Taierzhuang1938/_import/Script_DeathImpactProfileFloors.mjs <probe.json>
//
// <probe.json> is the output of the temporary browser probe (tmp/HitReaction/Script_DeathImpactProbe.mjs, see
// docs/Data_DeathImpactClips.md): the clip played on the real NRA and IJA GLB rigs through rig.mixer, lowest visible skin
// vertex of the final pose (before the runtime's ground fit). `floorProbeM` = {nra, ija}. The Kimodo mirrors have no
// Blender-side floor, so their `floorM` becomes the NRA value (the same raw asset offset the four originals have; the
// runtime's visible-skin ground fit lifts it, DEATH_CONTACT.poseEnd).
import fs from 'node:fs';
import path from 'node:path';

const probePath = process.argv[2];
if (!probePath) throw new Error('usage: Script_DeathImpactProfileFloors.mjs <probe.json>');
const project = path.resolve(import.meta.dirname, '..');
const file = path.join(project, 'Animation/HitReaction/Animation_TengxianDeathImpact.json');
const library = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = JSON.parse(fs.readFileSync(probePath, 'utf8'));
for (const [name, profile] of Object.entries(library.profiles)) {
  const nra = rows.find(r => r.kind === 'nra' && r.name === name);
  const ija = rows.find(r => r.kind === 'ija' && r.name === name);
  if (!nra || !ija) throw new Error('probe has no rows for ' + name);
  profile.floorProbeM = { nra: nra.skinFloor, ija: ija.skinFloor };
  if (profile.source === 'kimodo-mirror') profile.floorM = nra.skinFloor;
}
fs.writeFileSync(file, JSON.stringify(library));
console.log('floors written for', Object.keys(library.profiles).length, 'profiles');
