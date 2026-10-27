// Generate collision-test poses through the actual public runtime controller.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Object3D,Matrix4} from '../vendor/three/build/three.module.js';
import {LoadGlb} from '../_import/Script_LugouGlbPose.mjs';
import {Type89Motion} from '../Model/Type89MediumTank/Script_Type89Motion.mjs';
const Arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3),file=Arg('file'),output=Arg('out');if(!file||!output)throw new Error('Supply --file and --out');
const glb=LoadGlb(file),g=glb.json,objects=g.nodes.map(n=>{const o=new Object3D();o.name=n.name||'';o.userData=structuredClone(n.extras||{});if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);else{o.position.fromArray(n.translation||[0,0,0]);o.quaternion.fromArray(n.rotation||[0,0,0,1]);o.scale.fromArray(n.scale||[1,1,1]);}return o;});
for(let i=0;i<objects.length;i++)for(const child of g.nodes[i].children||[])objects[i].add(objects[child]);const root=new Object3D();for(const i of g.scenes[g.scene||0].nodes)root.add(objects[i]);
const track=JSON.parse(fs.readFileSync(Arg('track-path')||path.join(path.dirname(file),'Data_TrackPath.json'),'utf8')),rig=new Type89Motion(root,track),gun=rig.nodes.get('Node_BowMachineGun'),door=rig.nodes.get('Node_BowHatch');if(!rig.bowDoorLinkage)throw new Error('Model lacks the documented display linkage');
const radians=Math.PI/180,rows=[];
for(let h=0;h<=70;h++)for(const yaw of [-10,-5,0,5,10])for(const pitch of [-8,-4,0,4,8]){
 const requested={bowHatch:h*radians,bowMachineGunYaw:yaw*radians,bowMachineGunPitch:pitch*radians},effective=rig.SetPose(requested);gun.updateMatrix();door.updateMatrix();rows.push({requestedDegrees:{door:h,yaw,pitch},effectiveDegrees:{door:effective.bowHatch/radians,yaw:effective.bowMachineGunYaw/radians,pitch:effective.bowMachineGunPitch/radians},gunMatrix:[...gun.matrix.elements],doorMatrix:[...door.matrix.elements]});
}
const motionFile=new URL('../Model/Type89MediumTank/Script_Type89Motion.mjs',import.meta.url),report={method:'ActualType89Motion_SetPose_Object3DHierarchy',glbSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),runtimeScriptSha256:createHash('sha256').update(fs.readFileSync(motionFile)).digest('hex'),poseCount:rows.length,linkage:rig.bowDoorLinkage,rows};fs.writeFileSync(output,JSON.stringify(report));console.log(JSON.stringify({poseCount:rows.length,glbSha256:report.glbSha256,output}));
