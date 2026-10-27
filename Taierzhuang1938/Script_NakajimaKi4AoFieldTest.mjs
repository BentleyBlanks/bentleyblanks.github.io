// Sample the actual high/game GLB surfaces and their embedded AO images.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as T from './vendor/three/build/three.module.js';
import {LoadGlb,ReadAccessor,ReadAccessorInt} from './_import/Script_LugouGlbPose.mjs';

const scriptFile=fileURLToPath(import.meta.url),project=path.dirname(scriptFile);
const asset=process.env.KI4_ASSET_ROOT??path.join(project,'Model/NakajimaKi4');
const runtimePath=path.join(asset,'Model_NakajimaKi4.glb'),runtime=LoadGlb(runtimePath);
const metadata=runtime.json.nodes.find(n=>n.name==='NakajimaKi4')?.extras;
if(!metadata?.geometryAo?.enabled){console.log(JSON.stringify({skipped:true,reason:'Asset does not declare a geometry-AO profile'}));process.exit(0);}
const highPath=process.env.KI4_HIGH_GLB_PATH??(process.env.KI4_SOURCE_ROOT?path.join(process.env.KI4_SOURCE_ROOT,'Exports/Model_NakajimaKi4High.glb'):JSON.parse(fs.readFileSync(path.join(asset,'Data_ExportAudit.json'),'utf8')).high.path);
const high=LoadGlb(path.isAbsolute(highPath)?highPath:path.resolve(project,'..',highPath));
const Hash=value=>crypto.createHash('sha256').update(value).digest('hex');

function Body(glb){
 const g=glb.json,parents=new Map(),world=new Map(),meshes=[],images=new Set();
 for(let i=0;i<g.nodes.length;i++)for(const child of g.nodes[i].children??[])parents.set(child,i);
 function World(i){
  if(world.has(i))return world.get(i);
  const n=g.nodes[i],m=n.matrix?new T.Matrix4().fromArray(n.matrix):new T.Matrix4().compose(new T.Vector3(...(n.translation??[0,0,0])),new T.Quaternion(...(n.rotation??[0,0,0,1])),new T.Vector3(...(n.scale??[1,1,1])));
  if(parents.has(i))m.premultiply(World(parents.get(i)));world.set(i,m);return m;
 }
 for(let i=0;i<g.nodes.length;i++){
  const n=g.nodes[i];if(n.mesh===undefined||![n.name,...(n.extras?.sourceParts??[])].includes('Fuselage_Monocoque'))continue;
  for(const primitive of g.meshes[n.mesh].primitives){
   const material=g.materials[primitive.material],ao=material.occlusionTexture;
   assert.equal(ao?.texCoord,1,'Actual fuselage AO uses UV1');assert(!ao.extensions?.KHR_texture_transform,'AO UV1 has no untested texture transform');
   images.add(g.textures[ao.index].source);
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(ReadAccessor(glb,primitive.attributes.POSITION).data,3));
   geometry.setAttribute('uv1',new T.Float32BufferAttribute(ReadAccessor(glb,primitive.attributes.TEXCOORD_1).data,2));
   geometry.setIndex(new T.BufferAttribute(new Uint32Array(ReadAccessorInt(glb,primitive.indices).data),1));
   assert(geometry.attributes.position.count>0&&geometry.index.count>0,'Read actual nonempty position/index accessors');
   const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.matrixAutoUpdate=false;mesh.matrixWorld.copy(World(i));meshes.push(mesh);
  }
 }
 assert(meshes.length&&images.size===1,'Identify the actual body and one AO image');
 const image=g.images[[...images][0]];assert.equal(image.mimeType,'image/png');const view=g.bufferViews[image.bufferView];
 return{meshes,png:glb.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)};
}

const highBody=Body(high),runtimeBody=Body(runtime),ray=new T.Raycaster();
function Hit(body){
 const hit=ray.intersectObjects(body.meshes,false)[0];assert(hit,'Actual body ray intersects');
 const mesh=hit.object,point=hit.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
 const a=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,hit.face.a),b=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,hit.face.b),c=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,hit.face.c);
 const bary=T.Triangle.getBarycoord(point,a,b,c,new T.Vector3()),uv=mesh.geometry.attributes.uv1,value=new T.Vector2();
 for(const [index,weight]of [[hit.face.a,bary.x],[hit.face.b,bary.y],[hit.face.c,bary.z]])value.addScaledVector(new T.Vector2().fromBufferAttribute(uv,index),weight);
 return{pointGltfM:hit.point.toArray(),uv1Gltf:value.toArray(),triangle:hit.faceIndex};
}
const rows=[];
for(const height of [1.809,1.8099,1.81,1.8101,1.811])for(const station of [1.68,1.69,1.699,1.7,1.701,1.71,1.72]){
 ray.set(new T.Vector3(3,height,-station),new T.Vector3(-1,0,0));const a=Hit(highBody),b=Hit(runtimeBody);
 rows.push({heightSourceZM:height,stationSourceYM:station,high:a,runtime:b,positionDifferenceM:new T.Vector3(...a.pointGltfM).distanceTo(new T.Vector3(...b.pointGltfM))});
}
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'Ki4AoField_')),pngFiles=[path.join(temporary,'Texture_HighAo.png'),path.join(temporary,'Texture_RuntimeAo.png')];
let decoded;
try{
 fs.writeFileSync(pngFiles[0],highBody.png);fs.writeFileSync(pngFiles[1],runtimeBody.png);
 const python=String.raw`import sys,json,math
from PIL import Image
images=[Image.open(p).convert('RGB') for p in sys.argv[1:]]
def Sample(image,uv):
 w,h=image.size;x=uv[0]*w-.5;y=uv[1]*h-.5;ix=math.floor(x);iy=math.floor(y);fx=x-ix;fy=y-iy
 return sum(image.getpixel(((ix+dx)%w,(iy+dy)%h))[0]/255*(fx if dx else 1-fx)*(fy if dy else 1-fy) for dx in [0,1] for dy in [0,1])
queries=json.load(sys.stdin)
print(json.dumps({'sizes':[image.size for image in images],'values':[[Sample(images[0],q[0]),Sample(images[1],q[1])] for q in queries]}))`;
 const result=spawnSync(process.env.PYTHON??'python',['-c',python,...pngFiles],{input:JSON.stringify(rows.map(r=>[r.high.uv1Gltf,r.runtime.uv1Gltf])),encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,'Pillow decodes actual embedded AO: '+result.stderr);decoded=JSON.parse(result.stdout);
}finally{for(const filename of pngFiles)if(fs.existsSync(filename))fs.unlinkSync(filename);fs.rmdirSync(temporary);}
assert(decoded.sizes.every(size=>size[0]===4096&&size[1]===4096),'Both actual AO images retain4K resolution');
for(let i=0;i<rows.length;i++){rows[i].high.ao=decoded.values[i][0];rows[i].runtime.ao=decoded.values[i][1];rows[i].aoDifference=Math.abs(decoded.values[i][0]-decoded.values[i][1]);}
const maxAoDifference=Math.max(...rows.map(r=>r.aoDifference)),maxPositionDifferenceM=Math.max(...rows.map(r=>r.positionDifferenceM)),tolerance=1/255;
const report={ok:maxAoDifference<=tolerance&&maxPositionDifferenceM<.0014,scope:'Independent actual high/game GLB body rays and actual embedded PNG AO; includes both sides of the known UV1 seam.',runtimeSha256:Hash(runtime.buffer),highSha256:Hash(high.buffer),testScriptSha256:Hash(fs.readFileSync(scriptFile,'utf8').replace(/\r\n/g,'\n')),samples:rows.length,tolerance,maxAoDifference,maxPositionDifferenceM,imageSizes:decoded.sizes,rows};
const output=process.env.KI4_AO_FIELD_REPORT??(process.env.KI4_SOURCE_ROOT?path.join(process.env.KI4_SOURCE_ROOT,'Evidence/Data_AoFieldAgreement.json'):path.join(project,'../tmp/NakajimaKi4/AoFieldTest/Data_AoFieldAgreement.json'));
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({ok:report.ok,samples:report.samples,maxAoDifference,tolerance,maxPositionDifferenceM,report:output}));
assert(report.ok,'Actual high/game AO seam agreement must remain within one8-bit value');
