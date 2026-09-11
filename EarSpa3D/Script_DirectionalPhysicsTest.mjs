import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const core=await fs.readFile(new URL('./vendor/three/build/three.core.js',import.meta.url),'utf8');
const coreUrl='data:text/javascript;base64,'+Buffer.from(core).toString('base64');
const THREE=await import(coreUrl);
const source=(await fs.readFile(new URL('./Script_FractureGeometry.js',import.meta.url),'utf8')).replace("'three'",JSON.stringify(coreUrl));
const {FractureGeometry,GeometryVolume}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let checks=0;const Check=(ok,label)=>{assert.ok(ok,label);checks++;};
const sheet=new THREE.BoxGeometry(1.4,2.7,.08,6,12,1);
const x=FractureGeometry(sheet,{direction:[1,0,.2],seed:12}),y=FractureGeometry(sheet,{direction:[0,1,.2],seed:12});
Check(x.length>=2&&y.length>=2,'actual mesh faces split into separate fragments');
Check(x[0].userData.cutNormal[0]>.8&&y[0].userData.cutNormal[1]>.8,'cut normal follows the orthogonal applied directions');
for(const pieces of [x,y])Check(Math.abs(pieces.reduce((s,g)=>s+GeometryVolume(g),0)-GeometryVolume(sheet))<1e-5,'sealed split conserves volume');
let generations=[sheet],initial=GeometryVolume(sheet),smallest=initial;
for(let generation=0;generation<3;generation++){
 const next=[];
 for(const [i,g] of generations.entries()){const parts=FractureGeometry(g,{direction:generation%2?[1,0,.1]:[0,1,.1],seed:8+i,generation});next.push(...parts);}
 Check(next.length>generations.length,'each additional fracture generation creates smaller real geometries');
 Check(Math.abs(next.reduce((s,g)=>s+GeometryVolume(g),0)-initial)<1e-5,'recursive cuts conserve total volume');
 const maximum=Math.max(...next.map(GeometryVolume));Check(maximum<smallest,'maximum child volume decreases in each generation');smallest=maximum;generations=next;
}
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
