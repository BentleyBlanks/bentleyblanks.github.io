// Independent checks against the actual shipped glTF scene, including instances.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {LoadGlb,ReadAccessor} from './_import/Script_LugouGlbPose.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,'Model/Type89MediumTank/Model_Type89MediumTank.glb');
const glb=LoadGlb(file),g=glb.json;
let failures=0,checks=0;
function Check(condition,name,detail=''){checks++;if(!condition)failures++;console.log(`${condition?'ok  ':'FAIL'} ${name}${detail?'  '+detail:''}`);}
function Matrix(node){
  if(node.matrix)return node.matrix;
  const [x,y,z,w]=node.rotation??[0,0,0,1],[sx,sy,sz]=node.scale??[1,1,1],[tx,ty,tz]=node.translation??[0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];
}
function Multiply(a,b){const out=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
let triangles=0,nonFinite=0,normalError=0,degenerate=0;
const cannon=[];
const nodesByName=new Map(g.nodes.map(node=>[node.name,node]));
function Walk(index,parent){
  const node=g.nodes[index],world=Multiply(parent,Matrix(node));
  Check(!node.name?.startsWith('BakeProxy')&&!node.name?.startsWith('High_'),'Only the selected articulated model is exported: '+node.name);
  if(node.mesh!==undefined)for(const primitive of g.meshes[node.mesh].primitives){
    const positions=ReadAccessor(glb,primitive.attributes.POSITION),normal=ReadAccessor(glb,primitive.attributes.NORMAL);
    const indices=primitive.indices===undefined?Array.from({length:positions.count},(_,i)=>i):ReadAccessor(glb,primitive.indices).data;
    triangles+=indices.length/3;
    for(let i=0;i<positions.count;i++){
      const [x,y,z]=positions.data.slice(i*3,i*3+3),point=[world[0]*x+world[4]*y+world[8]*z+world[12],world[1]*x+world[5]*y+world[9]*z+world[13],world[2]*x+world[6]*y+world[10]*z+world[14]];
      for(let axis=0;axis<3;axis++){if(!Number.isFinite(point[axis]))nonFinite++;low[axis]=Math.min(low[axis],point[axis]);high[axis]=Math.max(high[axis],point[axis]);}
      normalError=Math.max(normalError,Math.abs(Math.hypot(...normal.data.slice(i*3,i*3+3))-1));
      if(node.name==='Mesh_MainGunRecoil')cannon.push(point);
    }
    for(let i=0;i<indices.length;i+=3){
      const a=positions.data.slice(indices[i]*3,indices[i]*3+3),b=positions.data.slice(indices[i+1]*3,indices[i+1]*3+3),c=positions.data.slice(indices[i+2]*3,indices[i+2]*3+3);
      const u=b.map((value,k)=>value-a[k]),v=c.map((value,k)=>value-a[k]);
      if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)degenerate++;
    }
  }
  for(const child of node.children??[])Walk(child,world);
}
for(const root of g.scenes[g.scene??0].nodes)Walk(root,identity);
Check(triangles===79921&&triangles<=80000,'Vehicle budget counts every repeated shoe after zero-area cleanup',String(triangles));
Check(nonFinite===0&&normalError<2e-4&&degenerate===0,'Finite geometry, unit normals, noncollapsed triangles',JSON.stringify({nonFinite,normalError,degenerate}));
const size=high.map((value,i)=>value-low[i]);
Check(Math.abs(size[0]-2.18)<.01&&Math.abs(size[1]-2.56)<.015&&Math.abs(size[2]-5.70)<.03&&Math.abs(low[1])<.001,'Measured metre scale and ground origin',JSON.stringify({low,high,size}));
Check(cannon.length>100&&cannon.reduce((sum,point)=>sum+point[2],0)/cannon.length<-.9,'Actual cannon vertex cloud faces -Z');
for(const side of ['Left','Right']){
  const links=g.nodes.filter(node=>node.name?.startsWith('Node_TrackLink'+side));
  const wheels=g.nodes.filter(node=>node.name?.includes(side)&&/^Node_(RoadWheel|LeadingWheel|FrontIdler|RearSprocket|ReturnRoller)/.test(node.name));
  Check(links.length===74&&wheels.length===15,'Independent links and all rotating wheel groups: '+side,`${links.length}/${wheels.length}`);
}
for(const name of ['Node_TurretYaw','Node_MainGunPitch','Node_MainGunRecoil','Node_BowMachineGun','Node_TurretMachineGun','Node_CommanderHatchFront','Node_CommanderHatchRear','Node_BowHatch','Node_DriverVisionFlap','Node_EngineHatchLeft','Node_EngineHatchRight'])Check(nodesByName.has(name),'Movable part survives export: '+name);
Check(nodesByName.get('Node_TurretYaw')?.extras?.runtimeAxis==='+Y'&&nodesByName.get('Node_MainGunRecoil')?.extras?.runtimeAxis==='-Z','Source and runtime axes are distinguished');

const imageCache=new Map();
async function ImageFor(textureInfo){
  const texture=g.textures[textureInfo.index],imageIndex=texture.source??texture.extensions?.EXT_texture_webp?.source;
  if(imageCache.has(imageIndex))return imageCache.get(imageIndex);
  const image=g.images[imageIndex],view=g.bufferViews[image.bufferView];
  const decoded=await sharp(Buffer.from(glb.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  imageCache.set(imageIndex,decoded);return decoded;
}
function UvSamples(materialIndex){
  const output=[];
  for(const mesh of g.meshes)for(const primitive of mesh.primitives){
    if(primitive.material!==materialIndex)continue;
    const uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0),indices=ReadAccessor(glb,primitive.indices).data;
    for(let i=0;i<indices.length;i+=3){
      const p=[0,1,2].map(k=>uv.data.slice(indices[i+k]*2,indices[i+k]*2+2));
      const area=Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]))*.5;
      if(area>2e-6)output.push({uv:[(p[0][0]+p[1][0]+p[2][0])/3,(p[0][1]+p[1][1]+p[2][1])/3],area});
    }
  }
  return output;
}
function Sample(image,uv,channel){const x=Math.min(image.info.width-1,Math.max(0,Math.floor(uv[0]*image.info.width))),y=Math.min(image.info.height-1,Math.max(0,Math.floor(uv[1]*image.info.height)));return image.data[(y*image.info.width+x)*4+channel]/255;}
for(const [index,material] of g.materials.entries()){
  if(material.name.endsWith('Shadow'))continue;
  const role=material.name.replace('Material_Type89Game',''),pbr=material.pbrMetallicRoughness;
  Check(pbr.baseColorTexture&&material.normalTexture&&pbr.metallicRoughnessTexture&&material.occlusionTexture&&material.occlusionTexture.index===pbr.metallicRoughnessTexture.index,'Complete Base/Normal/ORM with real AO: '+role);
  const [base,normal,orm]=await Promise.all([ImageFor(pbr.baseColorTexture),ImageFor(material.normalTexture),ImageFor(pbr.metallicRoughnessTexture)]);
  if(role==='Armor')Check(base.info.width===4096&&normal.info.width===4096&&orm.info.width===2048,'Full-resolution armor atlases');
  const samples=UvSamples(index);let weight=0,white=0,metal=0,rough=0,normalVariation=0;
  for(const sample of samples){weight+=sample.area;const rgb=[0,1,2].map(channel=>Sample(base,sample.uv,channel));if(rgb.every(value=>value>.99))white+=sample.area;metal+=Sample(orm,sample.uv,2)*sample.area;rough+=Sample(orm,sample.uv,1)*sample.area;normalVariation+=(Math.abs(Sample(normal,sample.uv,0)-.5)+Math.abs(Sample(normal,sample.uv,1)-.5))*sample.area;}
  const values={metal:metal/weight,rough:rough/weight,white:white/weight,normalVariation:normalVariation/weight};
  Check(weight>0&&values.white<.002&&values.normalVariation>.001,'UV surfaces contain mapped detail without blank projection: '+role,JSON.stringify(values));
  if(['Rubber','Glass'].includes(role))Check(values.metal<.005,'Dielectric material has zero metallic channel: '+role,String(values.metal));
  if(role==='Glass')Check(values.rough<.26&&material.extensions?.KHR_materials_transmission?.transmissionFactor>.8,'Actual glass roughness and transmission');
  if(role==='Exhaust')Check(Math.abs(values.metal-.35)<.04,'Exhaust metallic scalar is not stale roughness');
}
Check(imageCache.size===18,'Six complete physical PBR sets',String(imageCache.size));
console.log(`Type89MediumTank: ${checks-failures}/${checks} passed`);
process.exitCode=failures?1:0;
