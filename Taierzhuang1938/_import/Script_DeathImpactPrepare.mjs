// Export source-node poses for the BlenderMCP death-impact ragdoll baker. No shipped asset is written here.
// Start poses come from the game's own standing rifle clip (POSE_CLIPS.standFire = AdvanceFire on the
// shared TengxianHumanoidV1 skeleton). Output: tmp/DeathImpact/Data_DeathImpactSource.json.
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
// aim   = rifle shouldered, both hands on the gun (the pose most soldiers are in when they are shot)
// ready = rifle held low across the body while walking/advancing
const POSES = { aim: ['AdvanceFire', 2.2], ready: ['AdvanceFire', 0.8] };
const poses = {};
// scan set: every 0.2 s of the clip, so the baker can pick the poses the body can actually stand in
for (let t = 0; t <= 2.81; t += 0.2) POSES[`af${Math.round(t * 10).toString().padStart(2, '0')}`] = ['AdvanceFire', Math.round(t * 10) / 10];
for (const [id, [clip, time]] of Object.entries(POSES)) {
  scene.Apply(scene.AnimationIndex(clip), time);
  poses[id] = { clip, time, world: Snapshot() };
}
const folder = path.join(project, '../tmp/DeathImpact');
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'Data_DeathImpactSource.json'), JSON.stringify({ model, names, rest, poses }));
console.log('DeathImpact source poses prepared for Blender:', Object.keys(poses).join(', '));
