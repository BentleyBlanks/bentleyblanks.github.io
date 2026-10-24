// Independent checks against the actual shipped glTF scene, including instances.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {LoadGlb,ReadAccessor} from './_import/Script_LugouGlbPose.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,'Model/Type89MediumTank/Model_Type89MediumTank.glb');
const glb=LoadGlb(file),g=glb.json;
const contract=JSON.parse(fs.readFileSync(path.join(here,'Model/Type89MediumTank/Data_ReferenceContract.json'),'utf8'));
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
Check(triangles===contract.runtimeRenderedTriangles&&triangles<=contract.runtimeTriangleCeiling,'Vehicle budget counts every repeated shoe after zero-area cleanup',String(triangles));
const selectedGame=contract.selectedGameSourceTrianglesBeforeCleanup??triangles;
Check(contract.runtimeTriangleTarget===80000&&(triangles<=80000||((selectedGame-80000)/selectedGame<=.05&&contract.budgetPolicy==='PreserveSelectedGameTopologyWithinFivePercent')),'Existing five-percent rule funds visible detail without another topology reduction',JSON.stringify({selectedGame,actual:triangles,target:contract.runtimeTriangleTarget,ceiling:contract.runtimeTriangleCeiling}));
const removedZeroArea=(g.asset.extras?.Type89ZeroAreaCleanup??[]).reduce((sum,row)=>sum+row.removedRenderedTriangles,0);
Check(selectedGame-triangles===removedZeroArea&&contract.exportRemovedZeroAreaTriangles===removedZeroArea,'Every source/export triangle difference is accounted for by zero-area cleanup',String(removedZeroArea));
Check(nonFinite===0&&normalError<2e-4&&degenerate===0,'Finite geometry, unit normals, noncollapsed triangles',JSON.stringify({nonFinite,normalError,degenerate}));
let tangentMissing=0,tangentUnitError=0,tangentDotError=0,tangentHandednessErrors=0;
for(const mesh of g.meshes)for(const primitive of mesh.primitives){
  if(!g.materials[primitive.material].normalTexture)continue;
  if(primitive.attributes.TANGENT===undefined){tangentMissing++;continue;}
  const normals=ReadAccessor(glb,primitive.attributes.NORMAL).data,tangents=ReadAccessor(glb,primitive.attributes.TANGENT).data;
  for(let i=0;i<normals.length/3;i++){
    tangentUnitError=Math.max(tangentUnitError,Math.abs(Math.hypot(...tangents.slice(i*4,i*4+3))-1));
    tangentDotError=Math.max(tangentDotError,Math.abs(normals[i*3]*tangents[i*4]+normals[i*3+1]*tangents[i*4+1]+normals[i*3+2]*tangents[i*4+2]));
    if(Math.abs(tangents[i*4+3])!==1)tangentHandednessErrors++;
  }
}
Check(tangentMissing===0&&tangentUnitError<2e-4&&tangentDotError<2e-4&&tangentHandednessErrors===0,'Normal-mapped primitives retain unit orthogonal authored tangents and signed handedness',JSON.stringify({tangentMissing,tangentUnitError,tangentDotError,tangentHandednessErrors}));
const size=high.map((value,i)=>value-low[i]);
Check(Math.abs(size[0]-2.18)<.01&&Math.abs(size[1]-2.56)<.015&&Math.abs(size[2]-5.70)<.03&&Math.abs(low[1])<.001,'Measured metre scale and ground origin',JSON.stringify({low,high,size}));
Check(cannon.length>100&&cannon.reduce((sum,point)=>sum+point[2],0)/cannon.length<-.9,'Actual cannon vertex cloud faces -Z');
for(const side of ['Left','Right']){
  const links=g.nodes.filter(node=>node.name?.startsWith('Node_TrackLink'+side));
  const wheels=g.nodes.filter(node=>node.name?.includes(side)&&/^Node_(RoadWheel|LeadingWheel|FrontIdler|RearSprocket|ReturnRoller)/.test(node.name));
  Check(links.length===74&&wheels.length===15,'Independent links and all rotating wheel groups: '+side,`${links.length}/${wheels.length}`);
}
for(const name of ['Node_TurretYaw','Node_MainGunPitch','Node_MainGunRecoil','Node_BowMachineGun','Node_TurretMachineGun','Node_CommanderHatchFront','Node_CommanderHatchRear','Node_BowHatch','Node_BowDoorLatch','Node_DriverVisionFlap','Node_DriverPortShutter','Node_EngineHatchLeft','Node_EngineHatchRight'])Check(nodesByName.has(name),'Movable part survives export: '+name);
Check(nodesByName.get('Node_TurretYaw')?.extras?.runtimeAxis==='+Y'&&nodesByName.get('Node_MainGunRecoil')?.extras?.runtimeAxis==='-Z','Source and runtime axes are distinguished');
Check(g.nodes.some(node=>node.extras?.geometryVersion===contract.geometryVersion),'The exported geometry matches this reference contract');

// Test physical openings against the exported triangles, independently of
// dark paint, normal maps or metadata claiming that an opening exists.
function LocalGeometry(name,armorOnly=false,excludeShadow=false){
  const index=g.nodes.findIndex(node=>node.name===name),vertices=[],faces=[];
  if(index<0)return {vertices,faces};
  function Visit(i,parent,isRoot=false){
    const node=g.nodes[i],matrix=Multiply(parent,isRoot?identity:Matrix(node));
    if(node.mesh!==undefined)for(const primitive of g.meshes[node.mesh].primitives){
      if(armorOnly&&!g.materials[primitive.material].name.endsWith('Armor'))continue;
      if(excludeShadow&&g.materials[primitive.material].name.endsWith('Shadow'))continue;
      const positions=ReadAccessor(glb,primitive.attributes.POSITION).data,indices=ReadAccessor(glb,primitive.indices).data,base=vertices.length;
      for(let k=0;k<positions.length;k+=3){const [x,y,z]=positions.slice(k,k+3);vertices.push([matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]]);}
      for(let k=0;k<indices.length;k+=3)faces.push([base+indices[k],base+indices[k+1],base+indices[k+2]]);
    }
    for(const child of node.children??[])if(!g.nodes[child].name?.startsWith('Node_'))Visit(child,matrix);
  }
  Visit(index,identity,true);return {vertices,faces};
}
const Sub=(a,b)=>a.map((v,i)=>v-b[i]),Dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function RayHits(geometry,origin,direction,maxDistance){
  for(const face of geometry.faces){
    const [a,b,c]=face.map(i=>geometry.vertices[i]),edge1=Sub(b,a),edge2=Sub(c,a),p=Cross(direction,edge2),det=Dot(edge1,p);
    if(Math.abs(det)<1e-10)continue;
    const t=Sub(origin,a),u=Dot(t,p)/det;if(u<0||u>1)continue;
    const q=Cross(t,edge1),v=Dot(direction,q)/det;if(v<0||u+v>1)continue;
    const distance=Dot(edge2,q)/det;if(distance>1e-6&&distance<maxDistance)return true;
  }
  return false;
}
const shoeGeometry=LocalGeometry('Node_TrackLinkLeft000');
const shoeWidth=Math.max(...shoeGeometry.vertices.map(p=>p[0]))-Math.min(...shoeGeometry.vertices.map(p=>p[0]));
Check(Math.abs(shoeWidth-.320)<.0005,'Actual casting width follows the same-car front-photo320mm reconstruction',String(shoeWidth));
for(const side of ['Left','Right']){
  const sign=side==='Left'?-1:1,wheel=nodesByName.get('Node_LeadingWheel'+side),position=wheel.translation;
  const support=LocalGeometry('Node_Suspension'+side),disc=LocalGeometry(wheel.name);
  const offsets=[[.075,-.055],[.045,-.055]];
  Check(offsets.every(([y,z])=>RayHits(disc,[sign*.30,y,z],[-sign,0,0],.25)&&!RayHits(support,[sign*1.2,position[1]+y,position[2]+z],[-sign,0,0],.25)),
    'Reference-visible leading wheel dish is unobstructed by the fixed support: '+side);
  const roller=nodesByName.get('Node_ReturnRoller'+side+'01'),nextRoller=nodesByName.get('Node_ReturnRoller'+side+'02');
  const rollerGeometry=LocalGeometry(roller.name),radius=Math.max(...rollerGeometry.vertices.map(p=>Math.hypot(p[1],p[2])));
  const stationPitch=Math.hypot(...nextRoller.translation.map((value,i)=>value-roller.translation[i])),ratio=radius/stationPitch;
  // Independent2007/2025 rim measurements constrain this visible proportion;
  // camera fits and chosen factory-scale assumptions are not acceptance gates.
  Check(ratio>.086&&ratio<.100,'Return-rim size agrees with the measured adjacent-axle proportion: '+side,JSON.stringify({radius,stationPitch,ratio}));
}
Check(shoeGeometry.faces.length>0&&[-.375,-.150,.150,.375].every(ratio=>!RayHits(shoeGeometry,[ratio*shoeWidth,.10,0],[0,-1,0],.20))&&RayHits(shoeGeometry,[0,.10,0],[0,-1,0],.20),'Four true cast-shoe windows and a solid middle web');
// The rear pin is visible behind the trailing notch (first hit at100.08mm).
// Probe through the cast face at87.56mm, with a neighbouring solid-web control.
Check([-.336,0,.336].every(ratio=>!RayHits(shoeGeometry,[ratio*shoeWidth,.10,.065],[0,-1,0],.20))&&!RayHits(shoeGeometry,[0,.10,-.059],[0,-1,0],.095)&&RayHits(shoeGeometry,[.074*shoeWidth,.10,-.059],[0,-1,0],.095),'Photographed flange keyways and trailing central relief are true silhouette cut-outs');
Check([-.429,.429].every(ratio=>RayHits(shoeGeometry,[ratio*shoeWidth,.10,-.015],[0,-1,0],.20)),'Outer shoe windows retain their cast side webs');
const turretGeometry=LocalGeometry('Node_TurretYaw',true);
const bowGeometry=LocalGeometry('Node_BowPlate',true);
Check(!RayHits(bowGeometry,[-.13,.30,-.20],[0,0,1],.30)&&RayHits(bowGeometry,[-.215,.30,-.20],[0,0,1],.30),'Round bow port has a true opening and solid surrounding armor beneath its independent cover');
Check(!RayHits(turretGeometry,[0,.30,-.80],[0,0,1],.25)&&RayHits(turretGeometry,[.24,.30,-.80],[0,0,1],.25),'Mantlet aperture is cut through armor and its border remains solid');
const towGeometry=LocalGeometry('Node_BowTowClevis',true);
Check(!RayHits(towGeometry,[-.12,.010,-.095],[1,0,0],.24)&&RayHits(towGeometry,[-.12,0,-.045],[1,0,0],.24),'Tow eyes have transverse bores and solid surrounding metal');
const gunMountGeometry=LocalGeometry('Node_MainGunPitch',true);
Check(!RayHits(gunMountGeometry,[-.035,-.020,-.16],[0,0,1],.09)&&RayHits(gunMountGeometry,[-.14,-.020,-.16],[0,0,1],.09),'Sight shield has an open inner notch and a solid outer arm');
Check(!RayHits(gunMountGeometry,[-.025,-.024,-.16],[0,0,1],.18)&&RayHits(gunMountGeometry,[-.045,-.024,-.16],[0,0,1],.18),'A real vertical slit remains in the separate sight backing plate');
const boreGeometry=LocalGeometry('Node_MainGunRecoil',false,true);
Check(!RayHits(boreGeometry,[0,.032,-.80],[0,0,1],.18)&&RayHits(boreGeometry,[.035,.032,-.80],[0,0,1],.18),'Main bore stays physically open behind the flat muzzle annulus');
const allBoreGeometry=LocalGeometry('Node_MainGunRecoil');
const UniqueRing=points=>[...new Map(points.map(p=>[`${p[0].toFixed(8)},${p[1].toFixed(8)}`,p])).values()];
const metalRing=UniqueRing(allBoreGeometry.vertices.filter(p=>Math.abs(p[2]+.712)<1e-5&&Math.abs(Math.hypot(p[0],p[1]-.032)-.0285)<2e-6))
  .sort((a,b)=>Math.atan2(a[1]-.032,a[0])-Math.atan2(b[1]-.032,b[0]));
const linerRing=UniqueRing(allBoreGeometry.vertices.filter(p=>Math.abs(p[2]+.7072)<1e-5&&Math.hypot(p[0],p[1]-.032)>.027&&Math.hypot(p[0],p[1]-.032)<.0285));
const minimumMetalChord=Math.min(...metalRing.map((p,i)=>{const q=metalRing[(i+1)%metalRing.length],a=p[1]-.032,b=q[1]-.032;return Math.abs(p[0]*b-a*q[0])/Math.hypot(q[0]-p[0],b-a);}));
const maximumLinerRadius=Math.max(...linerRing.map(p=>Math.hypot(p[0],p[1]-.032)));
Check(metalRing.length>=24&&linerRing.length>=24&&minimumMetalChord-maximumLinerRadius>.0002,'Dark bore liner stays inside the actual low-poly metal chords',JSON.stringify({minimumMetalChord,maximumLinerRadius,gapM:minimumMetalChord-maximumLinerRadius}));

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
  if(role==='Armor'){
    Check(base.info.width===4096&&normal.info.width===4096&&orm.info.width===2048,'Full-resolution armor atlases');
    const cover=nodesByName.get('Mesh_BowRoundPortCover'),badgeSamples=[];
    if(cover?.mesh!==undefined)for(const primitive of g.meshes[cover.mesh].primitives){
      const positions=ReadAccessor(glb,primitive.attributes.POSITION).data,uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0).data,indices=ReadAccessor(glb,primitive.indices).data;
      for(let k=0;k<indices.length;k+=3){
        const tri=[0,1,2].map(i=>positions.slice(indices[k+i]*3,indices[k+i]*3+3));
        // Raised inner star has a23mm centre and15-17mm corners, behind the
        // plain closed lid. Select the actual facets, not blank atlas pixels.
        if(!tri.every(p=>p[2]>.0145&&p[1]<-.025)||!tri.some(p=>p[2]>.0225))continue;
        const sample=[0,1].map(axis=>[0,1,2].reduce((sum,i)=>sum+uv[indices[k+i]*2+axis],0)/3);
        badgeSamples.push([0,1,2].map(channel=>Sample(base,sample,channel)));
      }
    }
    Check(badgeSamples.length===10&&badgeSamples.every(([r,g,b])=>r>.70&&g>.54&&b<.40),'Inner five-point badge survives as geometry and mapped2007 gold colour',JSON.stringify(badgeSamples));
  }
  const samples=UvSamples(index);let weight=0,white=0,metal=0,rough=0,normalVariation=0;
  for(const sample of samples){weight+=sample.area;const rgb=[0,1,2].map(channel=>Sample(base,sample.uv,channel));if(rgb.every(value=>value>.99))white+=sample.area;metal+=Sample(orm,sample.uv,2)*sample.area;rough+=Sample(orm,sample.uv,1)*sample.area;normalVariation+=(Math.abs(Sample(normal,sample.uv,0)-.5)+Math.abs(Sample(normal,sample.uv,1)-.5))*sample.area;}
  const values={metal:metal/weight,rough:rough/weight,white:white/weight,normalVariation:normalVariation/weight};
  Check(weight>0&&values.white<.002&&values.normalVariation>.001,'UV surfaces contain mapped detail without blank projection: '+role,JSON.stringify(values));
  if(['Rubber','Glass'].includes(role))Check(values.metal<.005,'Dielectric material has zero metallic channel: '+role,String(values.metal));
  if(role==='Glass')Check(values.rough<.26&&material.extensions?.KHR_materials_transmission?.transmissionFactor>.8,'Actual glass roughness and transmission');
  if(role==='Exhaust')Check(Math.abs(values.metal-.35)<.04,'Exhaust metallic scalar is not stale roughness');
  if(role==='Guard'){
    let clear=0,solid=0,total=0;
    for(const mesh of g.meshes)for(const primitive of mesh.primitives){
      if(primitive.material!==index)continue;
      const uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0).data,indices=ReadAccessor(glb,primitive.indices).data;
      for(let i=0;i<indices.length;i+=3){const p=[0,1,2].map(k=>uv.slice(indices[i+k]*2,indices[i+k]*2+2));for(const a of [.15,.50,.85])for(const seed of [.15,.50,.85]){const b=(1-a)*seed,c=1-a-b,sample=[0,1].map(axis=>p[0][axis]*a+p[1][axis]*b+p[2][axis]*c),alpha=Sample(base,sample,3);total++;if(alpha<.25)clear++;if(alpha>.75)solid++;}}
    }
    Check(material.alphaMode==='MASK'&&(material.alphaCutoff??.5)===.5&&material.doubleSided===true&&(pbr.baseColorTexture.texCoord??0)===0,'Perforated guard loads as a double-sided UV0 alpha mask');
    Check(total>100&&clear/total>.10&&clear/total<.45&&solid/total>.40,'Holes remain visible on mapped guard surfaces, excluding atlas background',JSON.stringify({clear,solid,total}));
    Check(base.info.width===2048&&normal.info.width===2048&&orm.info.width===1024,'Guard retains its full-resolution opacity and PBR maps');
  }
}
Check(imageCache.size===21,'Seven complete physical PBR sets',String(imageCache.size));
console.log(`Type89MediumTank: ${checks-failures}/${checks} passed`);
process.exitCode=failures?1:0;
