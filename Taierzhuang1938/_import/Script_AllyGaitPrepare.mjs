// Export source-node poses for the BlenderMCP baker. No generated asset is written here.
import fs from 'node:fs';
import path from 'node:path';
import { LoadGlb, PoseScene } from './Script_LugouGlbPose.mjs';
const project=path.resolve(import.meta.dirname,'..');
const model='Model/Character/Model_TengxianNra02.glb';
const scene=new PoseScene(LoadGlb(path.join(project,model)));
const names=JSON.parse(fs.readFileSync(path.join(project,'Model/Character/Data_TengxianHumanoid.json'))).bodyBones.map(b=>b.name);
const index=new Map(scene.nodes.map((n,i)=>[n.name,i]));
const namesByTrack=new Map(names.map(n=>[n.replace(/\s/g,'_'),n]));
const Snapshot=()=>Object.fromEntries(names.map(n=>[n,Array.from(scene.world[index.get(n)])]));
scene.animations.push({name:'Rest',channels:[],duration:0});scene.Apply(scene.animations.length-1,0);
const rest=Snapshot(),clips={};
const relaxed=JSON.parse(fs.readFileSync(path.join(project,'Animation/RelaxedGait/Animation_TengxianHumanoidV1RelaxedGait.json')));
for(const clip of relaxed.clips){
  const channels=clip.tracks.map(t=>{const [name,property]=t.name.split('.');return {node:index.get(namesByTrack.get(name)),path:property==='quaternion'?'rotation':'translation',input:t.times,output:t.values,width:property==='quaternion'?4:3,interpolation:'LINEAR'};});
  scene.animations.push({name:clip.name,channels,duration:clip.duration});
  const count=Math.round(clip.duration*30),frames=[];
  for(let f=0;f<=count;f++){scene.Apply(scene.animations.length-1,clip.duration*(f%count)/count);frames.push(Snapshot());}
  clips[clip.name]={duration:clip.duration,frames};
}
const infantry=new PoseScene(LoadGlb(path.join(project,'Model/Character/Animation_TengxianNra02Infantry.glb')));
infantry.Apply(infantry.AnimationIndex('KneelHold'),.4);
const ready=Object.fromEntries(names.map(n=>[n,Array.from(infantry.world[infantry.NodeIndex(n)])]));
const folder=path.join(project,'../tmp/AllyGait');fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'Data_AllyGaitSource.json'),JSON.stringify({model,names,rest,ready,clips}));
console.log('AllyGait source poses prepared for Blender');
