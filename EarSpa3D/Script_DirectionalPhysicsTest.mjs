import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const core=await fs.readFile(new URL('./vendor/three/build/three.core.js',import.meta.url),'utf8');
const coreUrl='data:text/javascript;base64,'+Buffer.from(core).toString('base64');
const THREE=await import(coreUrl);
const source=(await fs.readFile(new URL('./Script_FractureGeometry.js',import.meta.url),'utf8')).replace("'three'",JSON.stringify(coreUrl));
const {FractureGeometry,GeometryVolume,CutGeometry}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let checks=0;const Check=(ok,label)=>{assert.ok(ok,label);checks++;};
const sheet=new THREE.BoxGeometry(1.4,2.7,.08,6,12,1);
const x=FractureGeometry(sheet,{normal:[1,0,.2],point:[.13,0,0]}),y=FractureGeometry(sheet,{normal:[0,1,.2],point:[0,-.21,0]});
Check(x.length>=2&&y.length>=2,'actual mesh faces split into separate fragments');
Check(x[0].userData.cutNormal[0]>.8&&y[0].userData.cutNormal[1]>.8,'cut normal preserves the physical stress section');
Check(FractureGeometry(sheet).length===0,'no fragments are invented without a physical section');
for(const pieces of [x,y])Check(Math.abs(pieces.reduce((s,g)=>s+GeometryVolume(g),0)-GeometryVolume(sheet))<1e-5,'sealed split conserves volume');
let generations=[sheet],initial=GeometryVolume(sheet),smallest=initial;
for(let generation=0;generation<3;generation++){
 const next=[];
 for(const [i,g] of generations.entries()){g.computeBoundingBox();const parts=FractureGeometry(g,{normal:generation%2?[1,0,.1]:[0,1,.1],point:g.boundingBox.getCenter(new THREE.Vector3()).toArray()});next.push(...parts);}
 Check(next.length>generations.length,'each additional fracture generation creates smaller real geometries');
 Check(Math.abs(next.reduce((s,g)=>s+GeometryVolume(g),0)-initial)<1e-5,'recursive cuts conserve total volume');
 const maximum=Math.max(...next.map(GeometryVolume));Check(maximum<smallest,'maximum child volume decreases in each generation');smallest=maximum;generations=next;
}
// Thin concave silhouettes and disconnected section loops used to be joined into invalid paper wedges.
const concave=new THREE.Shape();concave.moveTo(0,0);concave.lineTo(2,0);concave.lineTo(2,.6);concave.lineTo(.65,.6);concave.lineTo(.65,2);concave.lineTo(0,2);concave.closePath();
const thin=new THREE.ExtrudeGeometry(concave,{depth:.025,bevelEnabled:false,steps:1}),slice=CutGeometry(thin,new THREE.Vector3(0,0,1),.0125,true);
Check(Math.abs(GeometryVolume(slice)-GeometryVolume(thin)/2)<1e-6,'concave thin section preserves exact half volume');
const pos=slice.attributes.position,cap=slice.attributes.waxCap;
for(let i=0;i<pos.count;i+=3)if(cap.getX(i)>.5){const x=(pos.getX(i)+pos.getX(i+1)+pos.getX(i+2))/3,y=(pos.getY(i)+pos.getY(i+1)+pos.getY(i+2))/3;assert.ok(x<=.650001||y<=.600001,'concave cap never bridges the missing corner');}
Check([...slice.attributes.normal.array].every(Number.isFinite),'ultrathin shell and fracture normals stay finite');
const shellA=new THREE.BoxGeometry(.6,.9,.04).toNonIndexed(),shellB=shellA.clone().translate(2,0,0),separate=new THREE.BufferGeometry();separate.setAttribute('position',new THREE.Float32BufferAttribute([...shellA.attributes.position.array,...shellB.attributes.position.array],3));
const separateCut=CutGeometry(separate,new THREE.Vector3(0,0,1),.001,true),sp=separateCut.attributes.position,sc=separateCut.attributes.waxCap;
for(let i=0;i<sp.count;i+=3)if(sc.getX(i)>.5){const x=(sp.getX(i)+sp.getX(i+1)+sp.getX(i+2))/3;assert.ok(x<.30001||x>1.69999,'independent section rings must never be bridged');}
Check(Math.abs(GeometryVolume(separateCut)-.6*.9*.019*2)<1e-6,'separate cut loops each seal their own volume');
const contactSource=(await fs.readFile(new URL('./Script_ToolContact.js',import.meta.url),'utf8')).replace("'three'",JSON.stringify(coreUrl));
const {CreateToolContact}=await import('data:text/javascript;base64,'+Buffer.from(contactSource).toString('base64'));
const profile=JSON.parse(await fs.readFile(new URL('./Data_CanalProfile.json',import.meta.url),'utf8')),contact=CreateToolContact(profile),centers=profile.map(f=>new THREE.Vector3().fromArray(f.center));
let compared=0;
for(let sample=0;sample<1200;sample++){
 const p=new THREE.Vector3(Math.sin(sample*1.73)*11,Math.cos(sample*.37)*8,(sample%101)/100*32-2);let distance=Infinity,depth=0;
 for(let i=0;i<centers.length-1;i++){const axis=centers[i+1].clone().sub(centers[i]),t=THREE.MathUtils.clamp(p.clone().sub(centers[i]).dot(axis)/axis.lengthSq(),0,1),d=p.distanceToSquared(centers[i].clone().addScaledVector(axis,t));if(d<distance){distance=d;depth=i+t;}}
 const actual=contact.Surface(p);if(actual.depth<0)continue;assert.ok(Math.abs(actual.depth-depth)<1e-8,'accelerated surface agrees with independent full segment search');compared++;
}
Check(compared>900,'exact spatial acceleration verified across the full curved canal');
console.log('PASS '+checks+' directional fracture/contact checks ('+compared+' independent surface comparisons)');
