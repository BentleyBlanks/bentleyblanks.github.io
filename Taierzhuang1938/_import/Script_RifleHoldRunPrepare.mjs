// Export source-node poses for the RifleHoldRun BlenderMCP baker. No generated asset is written here.
// Only two samples are needed, both on the shared TengxianHumanoidV1 bind, evaluated on NRA02:
//   rest  - the bind (T) pose, to tie Blender's bone frames to the glTF nodes;
//   ready - IjaGuardPort frame 0 (the two-hand rifle hold of the 01 opening library), used only as
//           the *shape* of the two hands on a rifle (finger curl, wrist roll against the rifle frame).
// The legs, spine, arm placement and the whole run cycle are authored in Script_RifleHoldRunBake.py.
import fs from 'node:fs';
import path from 'node:path';
import { LoadGlb, PoseScene } from './Script_LugouGlbPose.mjs';
const project = path.resolve(import.meta.dirname, '..');
const model = 'Model/Character/Model_TengxianNra02.glb';
const scene = new PoseScene(LoadGlb(path.join(project, model)));
const names = JSON.parse(fs.readFileSync(path.join(project, 'Model/Character/Data_TengxianHumanoid.json'))).bodyBones.map(b => b.name);
const index = new Map(scene.nodes.map((n, i) => [n.name, i]));
const Snapshot = () => Object.fromEntries(names.map(n => [n, Array.from(scene.world[index.get(n)])]));
scene.animations.push({ name: 'Rest', channels: [], duration: 0 });
scene.Apply(scene.animations.length - 1, 0);
const rest = Snapshot();
// IjaGuardPort frame 0 (local TRS, stride 7) as the two-hand hold reference.
const library = JSON.parse(fs.readFileSync(path.join(project, 'Animation/OpeningStoryboards/Animation_TengxianIja01OpeningStoryboards.json')));
const guard = library.clips.IjaGuardPort;
scene.animations.push({
  name: 'IjaGuardPort', duration: 0, channels: library.bones.flatMap((name, i) => {
    const node = index.get(name), v = guard.values.slice(i * 7, i * 7 + 7); if (node == null) return [];
    return [{ node, path: 'translation', input: [0], output: v.slice(0, 3), width: 3, interpolation: 'LINEAR' },
            { node, path: 'rotation', input: [0], output: v.slice(3, 7), width: 4, interpolation: 'LINEAR' }];
  })
});
scene.Apply(scene.animations.length - 1, 0);
const ready = Snapshot();
const folder = path.join(project, '../tmp/RifleHoldRun'); fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'Data_RifleHoldRunSource.json'), JSON.stringify({ model, names, rest, ready }));
console.log('RifleHoldRun source poses prepared for Blender:', names.length, 'bones');
