// Export source-node poses for the IJA alert-gait BlenderMCP baker. No generated asset is written here.
// Legs: BackRifleRun (the upright jog) and RelaxedWalk / RelaxedStand; arms: IjaGuardPort (IJA01's rifle
// levelled at the waist, 01 opening library). All on the shared TengxianHumanoidV1 bind, sampled on IJA01.
import fs from 'node:fs';
import path from 'node:path';
import { LoadGlb, PoseScene } from './Script_LugouGlbPose.mjs';
import { ACTOR_LOCOMOTION_PROFILES } from '../Data_ActorLocomotion.mjs';
const project=path.resolve(import.meta.dirname,'..');
const model='Model/Character/Model_TengxianIja01.glb';
const scene=new PoseScene(LoadGlb(path.join(project,model)));
const names=JSON.parse(fs.readFileSync(path.join(project,'Model/Character/Data_TengxianHumanoid.json'))).bodyBones.map(b=>b.name);
const index=new Map(scene.nodes.map((n,i)=>[n.name,i]));
const namesByTrack=new Map(names.map(n=>[n.replace(/\s/g,'_'),n]));
const Snapshot=()=>Object.fromEntries(names.map(n=>[n,Array.from(scene.world[index.get(n)])]));
const Sample=(name,duration)=>{
  const count=Math.round(duration*30),frames=[];
  for(let f=0;f<=count;f++){scene.Apply(scene.animations.length-1,duration*(f%count)/count);frames.push(Snapshot());}
  return {name,duration,frames};
};
scene.animations.push({name:'Rest',channels:[],duration:0});scene.Apply(scene.animations.length-1,0);
const rest=Snapshot(),clips={};
// RelaxedGait: three.js tracks on the same bind.
const relaxed=JSON.parse(fs.readFileSync(path.join(project,'Animation/RelaxedGait/Animation_TengxianHumanoidV1RelaxedGait.json')));
for(const clip of relaxed.clips){
  const channels=clip.tracks.map(t=>{const [name,property]=t.name.split('.');return {node:index.get(namesByTrack.get(name)),path:property==='quaternion'?'rotation':'translation',input:t.times,output:t.values,width:property==='quaternion'?4:3,interpolation:'LINEAR'};})
    .filter(c=>c.node!=null);
  scene.animations.push({name:clip.name,channels,duration:clip.duration});
  clips[clip.name]=Sample(clip.name,clip.duration);
}
// BackRifleRun: glTF channels of its own GLB, matched to IJA01 by node name (identical bind, see Adapt in Script_RelaxedGait).
const back=new PoseScene(LoadGlb(path.join(project,'Animation/BackRifleRun/Animation_TengxianNraBackRifleRun.glb')));
const run=back.animations[back.AnimationIndex('BackRifleRun')];
scene.animations.push({name:'BackRifleRun',duration:run.duration,channels:run.channels
  .filter(c=>c.path!=='scale'&&names.includes(back.nodes[c.node].name))
  .map(c=>({...c,node:index.get(back.nodes[c.node].name)}))});
clips.BackRifleRun=Sample('BackRifleRun',run.duration);
// IjaGuardPort frame 0 (local TRS, stride 7) as the two-hand hold reference.
const library=JSON.parse(fs.readFileSync(path.join(project,'Animation/OpeningStoryboards/Animation_TengxianIja01OpeningStoryboards.json')));
const guard=library.clips.IjaGuardPort;
scene.animations.push({name:'IjaGuardPort',duration:0,channels:library.bones.flatMap((name,i)=>{
  const node=index.get(name),v=guard.values.slice(i*7,i*7+7);if(node==null)return [];
  return [{node,path:'translation',input:[0],output:v.slice(0,3),width:3,interpolation:'LINEAR'},
          {node,path:'rotation',input:[0],output:v.slice(3,7),width:4,interpolation:'LINEAR'}];
})});
scene.Apply(scene.animations.length-1,0);
const ready=Snapshot();
const folder=path.join(project,'../tmp/IjaAlertGait');fs.mkdirSync(folder,{recursive:true});
// Foot contacts and reference paces of the source cycles (the baker repeats them per cycle).
const walk=JSON.parse(fs.readFileSync(path.join(project,'Animation/RelaxedGait/Data_RelaxedGait.json'))).walk;
const runProfile=Object.values(ACTOR_LOCOMOTION_PROFILES).find(p=>p.BackRifleRun).BackRifleRun;
const profiles={RelaxedWalk:{referenceMps:walk.referenceSpeedMps,contacts:walk.contacts},
  BackRifleRun:{referenceMps:runProfile.referenceMps,contacts:runProfile.contacts}};
fs.writeFileSync(path.join(folder,'Data_IjaAlertGaitSource.json'),JSON.stringify({model,names,rest,ready,clips,profiles}));
console.log('IjaAlertGait source poses prepared for Blender:',Object.entries(clips).map(([k,c])=>`${k} ${c.frames.length-1}f`).join(', '));
