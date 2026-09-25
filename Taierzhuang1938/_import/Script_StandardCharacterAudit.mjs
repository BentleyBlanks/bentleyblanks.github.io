// Recompute the manifest's pose bands from the shipped bytes, after the Blender bake.
import fs from 'node:fs';
import path from 'node:path';
import { LoadGlb, MeasurePose } from './Script_LugouGlbPose.mjs';
const project=path.resolve(import.meta.dirname,'..');
const file=path.join(project,'Model/Character/Data_TengxianCharacterManifest.json');
const manifest=JSON.parse(fs.readFileSync(file));
for(const model of manifest.models){
 const glb=LoadGlb(path.join(project,model.url));
 const measured=MeasurePose(glb,{samples:121,ground:true,pelvisName:model.boneRoles.pelvis,headName:model.boneRoles.head});
 for(const [id,pose] of Object.entries(measured.byClip))Object.assign(model.animationAudit[id],{
  pelvisHeightMeters:pose.pelvis,maxGroundPenetrationMeters:Math.max(0,-pose.minSkinnedY),
 });
 model.skeleton='TengxianHumanoidV1';
 console.log(model.id,'pelvis band',measured.pelvisLow.toFixed(3),measured.pelvisHigh.toFixed(3));
}
fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
