// Independent audit of the exported bridge. This does not load a campaign,
// change the 44 m blockout, or accept the baker's own dimension claims as proof.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import * as THREE from './vendor/three/build/three.module.js';
import {LoadGlb,ReadAccessor} from './_import/Script_LugouGlbPose.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,'Model/Model_BeishaheBridge.glb');
const specPath=path.join(here,'_blender/Data_BeishaheBridgeSpec.json');
const dataPath=path.join(here,'Model/Data_BeishaheBridge.json');
let checks=0;
function Check(ok,label,detail=''){checks++;if(!ok)throw Error(`${label}${detail?`: ${typeof detail==='string'?detail:JSON.stringify(detail)}`:''}`);}
const Hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const name of [file,specPath,dataPath])Check(fs.existsSync(name),'Required bridge source/asset exists',path.relative(here,name));
const bytes=fs.readFileSync(file),specBytes=fs.readFileSync(specPath);
const spec=JSON.parse(specBytes),data=JSON.parse(fs.readFileSync(dataPath,'utf8'));
Check(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'Valid complete GLB 2.0 container');
const glb=LoadGlb(bytes),g=glb.json;
Check(!g.cameras?.length&&!g.extensions?.KHR_lights_punctual,'No review cameras or lamps in shipped bridge');
Check(!g.animations?.length&&!g.skins?.length,'Only the authorized intact static bridge is exported');
const objects=(g.nodes||[]).map(n=>{const o=new THREE.Object3D();o.name=n.name||'';o.userData=n.extras||{};if(n.matrix)new THREE.Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);else{if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);}return o;});
(g.nodes||[]).forEach((n,i)=>(n.children||[]).forEach(c=>objects[i].add(objects[c])));
const root=new THREE.Group();for(const i of g.scenes[g.scene||0].nodes)root.add(objects[i]);root.updateMatrixWorld(true);
const geometryCache=new Map(),parts=[],bounds=new THREE.Box3();
let triangles=0,nonFinite=0,normalError=0,uvMissing=0,degenerate=0;
function PrimitiveGeometry(primitive){
  if(geometryCache.has(primitive))return geometryCache.get(primitive);
  const positions=ReadAccessor(glb,primitive.attributes.POSITION),indices=primitive.indices==null?null:ReadAccessor(glb,primitive.indices).data;
  const normals=primitive.attributes.NORMAL==null?null:ReadAccessor(glb,primitive.attributes.NORMAL);
  const uv=primitive.attributes.TEXCOORD_0==null?null:ReadAccessor(glb,primitive.attributes.TEXCOORD_0);
  if(!uv)uvMissing++;
  Check(normals&&normals.count===positions.count,'Every exported mesh has vertex normals');
  for(let i=0;i<normals.data.length;i+=3)normalError=Math.max(normalError,Math.abs(Math.hypot(normals.data[i],normals.data[i+1],normals.data[i+2])-1));
  const localBounds=new THREE.Box3();for(let i=0;i<positions.data.length;i+=3){const p=new THREE.Vector3(positions.data[i],positions.data[i+1],positions.data[i+2]);if(!p.toArray().every(Number.isFinite))nonFinite++;localBounds.expandByPoint(p);}
  if(uv)Check([...uv.data].every(Number.isFinite),'UV coordinates are finite');
  const at=(i)=>new THREE.Vector3(positions.data[i*3],positions.data[i*3+1],positions.data[i*3+2]);
  for(let i=0;i<(indices?.length??positions.count);i+=3){const a=at(indices?indices[i]:i),b=at(indices?indices[i+1]:i+1),c=at(indices?indices[i+2]:i+2);if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)degenerate++;}
  const result={positions:positions.data,indices,localBounds,triangles:(indices?.length??positions.count)/3};geometryCache.set(primitive,result);return result;
}
for(let i=0;i<g.nodes.length;i++){
  const node=g.nodes[i];if(node.mesh==null)continue;
  Check(!/^Wreck|^High_|^Reference|^Review|^BakeProxy/i.test(node.name||''),'No unrequested wreck or review-only mesh',node.name);
  const ancestry=[];for(let o=objects[i];o&&o!==root;o=o.parent)ancestry.push(o.name);
  const name=ancestry.join('/');
  for(const primitive of g.meshes[node.mesh].primitives){
    Check((primitive.mode??4)===4,'Bridge uses ordinary triangles',node.name);
    const geo=PrimitiveGeometry(primitive),box=geo.localBounds.clone().applyMatrix4(objects[i].matrixWorld);
    bounds.union(box);triangles+=geo.triangles;
    parts.push({node,name,primitive,geo,matrix:objects[i].matrixWorld.clone(),bounds:box});
  }
}
Check(nonFinite===0&&normalError<.001&&uvMissing===0,'Actual geometry has finite metre positions, unit normals and UV',JSON.stringify({nonFinite,normalError,uvMissing}));
Check(degenerate===0,'No collapsed triangles in channel cross members or other exported geometry',degenerate);
Check(triangles>10000&&triangles<5000000,'Whole bridge has bounded, nonempty rendered geometry',triangles);
const size=bounds.getSize(new THREE.Vector3());
Check(size.z>=280&&size.z<292&&size.x>=3.8&&size.x<12&&size.y>=6&&size.y<12,'Actual whole-bridge bounds use metres, 14 x 20 m long axis Z',{min:bounds.min.toArray(),max:bounds.max.toArray(),size:size.toArray()});
Check(Math.abs((bounds.min.z+bounds.max.z)/2)<.02&&Math.abs((bounds.min.x+bounds.max.x)/2)<.02,'Bridge is centered on X/Z origin');
Check(bounds.max.y>=1.8&&bounds.max.y<=2.4&&bounds.min.y>=-8&&bounds.min.y<=-4.5,'Low half-through truss stays near 2 m above the sleeper datum',bounds.min.toArray().concat(bounds.max.toArray()));

// Material records and decoded bytes are checked independently of screenshots.
Check(g.materials?.length>=3&&g.images?.length>=3,'Steel, stone and timber carry actual textured materials');
const imageStats=[];
for(const [i,image] of g.images.entries()){
  let payload;
  if(image.bufferView!=null){const bv=g.bufferViews[image.bufferView];payload=glb.bin.subarray(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength);}
  else{Check(image.uri&&!/^(https?:|data:)/i.test(image.uri),'External texture is an ordinary local asset',image.uri);payload=fs.readFileSync(path.resolve(path.dirname(file),image.uri));}
  const meta=await sharp(payload).metadata();
  Check(meta.width>=16&&meta.height>=16&&meta.width<=8192&&meta.height<=8192,'Every image decodes at its authored resolution',{index:i,width:meta.width,height:meta.height});
  imageStats.push({index:i,width:meta.width,height:meta.height,sha256:Hash(payload)});
}
for(const m of g.materials){
  const p=m.pbrMetallicRoughness;
  Check(p&&p.baseColorTexture&&m.normalTexture,'Each physical material contains actual base and normal textures',m.name);
  if(/Steel|Stone/.test(m.name))Check(p.metallicRoughnessTexture,'Steel and masonry retain their actual roughness textures',m.name);
  Check(!m.extensions?.KHR_materials_unlit&&(m.alphaMode??'OPAQUE')==='OPAQUE','Bridge physical surfaces are opaque lit PBR',m.name);
  for(const v of [p.metallicFactor??1,p.roughnessFactor??1])Check(Number.isFinite(v)&&v>=0&&v<=1,'Material factors stay physical',m.name);
  for(const t of [p.baseColorTexture,p.metallicRoughnessTexture,m.normalTexture,m.occlusionTexture].filter(Boolean)){const tx=g.textures?.[t.index];Check(tx&&(tx.source!=null||tx.extensions?.EXT_texture_webp?.source!=null),'Material texture points to an existing image',m.name);}
}

Check(spec.schemaVersion===1&&data.schemaVersion===1&&data.version===spec.version,'Spec and sidecar schema/version agree');
Check(spec.units==='m'&&spec.lengthM===280&&spec.spanCount===14&&spec.spanPitchM===20&&spec.gaugeM===1.435,'Authorized metric design: fourteen 20 m spans and standard inner rail gauge');
Check(JSON.stringify(data.spec)===JSON.stringify(spec),'Shipped sidecar embeds the current source spec');
Check(data.glbSha256===Hash(bytes)&&data.glbBytes===bytes.length&&data.triangles===triangles,'Sidecar identifies these actual GLB bytes and rendered triangles');
for(const [key,actual] of [['min',bounds.min.toArray()],['max',bounds.max.toArray()],['size',size.toArray()]])Check(Array.isArray(data.bounds?.[key])&&actual.every((v,i)=>Math.abs(v-data.bounds[key][i])<.002),'Baker bounds independently match world-space exported vertices',key);
Check(typeof data.reconstructionScope==='string'&&/not a proven 1938 bridge length/i.test(data.reconstructionScope)&&/44 m/.test(data.reconstructionScope),'Asset explicitly distinguishes modern-scale reconstruction from proven 1938 bridge geometry');
Check(data.historicalReferences?.length>=3&&data.historicalReferences.every(r=>/^https:\/\//.test(r.url)&&r.supports),'Historical reference scope remains attached to the asset');
const Role=p=>p.node.extras?.role;
const ByRole=(role,index)=>parts.filter(p=>Role(p)===role&&(index==null||p.node.extras?.spanIndex===index));
const pointCache=new Map();
function Points(part){if(pointCache.has(part))return pointCache.get(part);const out=[];for(let i=0;i<part.geo.positions.length;i+=3)out.push(new THREE.Vector3(part.geo.positions[i],part.geo.positions[i+1],part.geo.positions[i+2]).applyMatrix4(part.matrix));pointCache.set(part,out);return out;}
function PartBounds(list){const box=new THREE.Box3();for(const p of list)box.union(p.bounds);return box;}
function SubBounds(points,predicate){const box=new THREE.Box3();for(const p of points)if(predicate(p))box.expandByPoint(p);return box;}
const rayMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),rayCache=new Map();
function RayMesh(part){if(rayCache.has(part))return rayCache.get(part);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(part.geo.positions,3));if(part.geo.indices)geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(part.geo.indices),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,rayMaterial);mesh.matrixAutoUpdate=false;mesh.matrix.copy(part.matrix);mesh.updateMatrixWorld(true);rayCache.set(part,mesh);return mesh;}
function Hits(list,origin,direction,far){const ray=new THREE.Raycaster(origin,direction,0,far);const hits=[];for(const part of list)if(ray.ray.intersectsBox(part.bounds))RayMesh(part).raycast(ray,hits);return hits.sort((a,b)=>a.distance-b.distance);}
Check(ByRole('Pier').length===spec.spanCount-1&&ByRole('Cap').length===spec.spanCount-1&&ByRole('abutment').length===2,'Thirteen masonry piers, their caps and two abutments are real meshes');
Check(data.assemblies?.length===14,'Sidecar inventories exactly fourteen intact spans');
let bearingCount=0;
for(let i=0;i<spec.spanCount;i++){
  const center=-spec.lengthM/2+spec.spanPitchM*(i+.5),length=spec.spanPitchM-spec.expansionGapM;
  const trusses=ByRole('Trusses',i),sleepers=ByRole('Sleepers',i),west=ByRole('RailWest',i),east=ByRole('RailEast',i),bearings=ByRole('Bearings',i);
  Check(trusses.length===1&&sleepers.length===1&&west.length===1&&east.length===1&&bearings.length===1,'Span has independent structural, sleeper, rail and bearing geometry',i+1);
  Check(data.assemblies[i].spanIndex===i&&Math.abs(data.assemblies[i].centerZ-center)<.0001&&data.assemblies[i].bearings.length===4,'Sidecar span location and four bearing inventory agree with metric layout',i+1);
  const w=Points(west[0]),e=Points(east[0]);
  const wHead=SubBounds(w,p=>p.y>spec.railHeightM-.035),eHead=SubBounds(e,p=>p.y>spec.railHeightM-.035);
  Check(Math.abs(eHead.min.x-wHead.max.x-spec.gaugeM)<.0001,'Gauge is measured between the actual inner rail-head faces',i+1);
  for(const box of [wHead,eHead])Check(Math.abs(box.max.z-box.min.z-length)<.001&&Math.abs(box.max.x-box.min.x-spec.railHeadWidthM)<.001,'Actual rail head has full span length and section width',i+1);
  const sb=PartBounds(sleepers);Check(Math.abs(sb.max.y)<.0001&&Math.abs(sb.max.x-sb.min.x-spec.sleeperLengthM)<.001,'Sleeper top is the zero-height datum and retains physical width',i+1);
  const bp=Points(bearings[0]),tp=Points(trusses[0]);
  Check(bp.every(p=>Math.abs(Math.abs(p.x)-spec.trussCenterOffsetM)<.4&&Math.abs(Math.abs(p.z-center)-(length/2-.20))<.45),'Bearing mesh contains exactly the four expected spatial clusters',i+1);
  for(const end of [-1,1])for(const side of [-1,1]){
    const x=side*spec.trussCenterOffsetM,z=center+end*(length/2-.20);
    const b=SubBounds(bp,p=>Math.abs(p.x-x)<.4&&Math.abs(p.z-z)<.45);
    Check(!b.isEmpty()&&b.max.x-b.min.x>.35&&b.max.z-b.min.z>.4&&Math.abs(b.max.y-spec.bearingTopY)<.002,'Actual bearing stack exists at each of four load paths',{span:i+1,end,side});
    const seat=SubBounds(tp,p=>Math.abs(p.x-x)<.18&&Math.abs(p.z-z)<.22&&p.y<-.5);
    Check(!seat.isEmpty()&&Math.abs(seat.min.y-b.max.y)<.012,'Truss bearing seat physically reaches the bearing top without a floating gap',{span:i+1,end,side,seatMin:seat.min.y,bearingTop:b.max.y});
    Check(Math.abs(b.min.y-spec.pierTopY)<.002,'Bearing base reaches the masonry cap elevation',{span:i+1,end,side});
    bearingCount++;
  }
  for(const side of [-1,1]){
    const from=new THREE.Vector3(side*(spec.trussCenterOffsetM+.6),spec.trussTopY,center),dir=new THREE.Vector3(-side,0,0);
    Check(Hits(trusses,from,dir,1.2).length>0,'Low upper chord is actual open-channel geometry',{span:i+1,side});
    from.y=spec.trussBottomY;Check(Hits(trusses,from,dir,1.2).length>0,'Main lower chord is present',{span:i+1,side});
    for(let k=0;k<spec.panelsPerSpan;k++){from.y=(spec.trussTopY+spec.trussBottomY)/2;from.z=center-length/2+(k+.5)*length/spec.panelsPerSpan;Check(Hits(trusses,from,dir,1.2).length>0,'Each panel contains a physical diagonal member',{span:i+1,side,panel:k+1});}
  }
  // Pony trusses remain open over the track. An actual high transverse member
  // would intersect these rays even if a sidecar called it a half-through bridge.
  const superstructure=[...trusses,...ByRole('Rivets',i)];
  for(let k=0;k<=16;k++)for(const x of [-.45,0,.45]){
    const z=center-length/2+(k+.25)*length/17;
    Check(Hits(superstructure,new THREE.Vector3(x,.35,z),new THREE.Vector3(0,1,0),4).length===0,'Track corridor has no high portal or roof cross brace',{span:i+1,x,k});
  }
  if(i===spec.spanCount-1){let openings=0,occupied=0;for(let k=0;k<100;k++){const z=center-length/2+.1+k*(length-.2)/99;const hit=Hits([...trusses,...sleepers],new THREE.Vector3(0,.3,z),new THREE.Vector3(0,-1,0),.49).length>0;if(hit)occupied++;else openings++;}Check(openings>=30&&occupied>=20,'Real open sleeper deck has visible gaps and timber tread, not a closed plank slab',{openings,occupied});}
}
Check(bearingCount===56,'All fifty-six span-end bearing load paths are inspected');
for(const mesh of rayCache.values())mesh.geometry.dispose();rayMaterial.dispose();
console.log(`PASS BeishaheBridgeTest: ${checks} checks; ${triangles} triangles, ${parts.length} mesh primitives, ${g.materials.length} materials / ${imageStats.length} decoded images; ${size.toArray().map(v=>v.toFixed(3)).join(' x ')} m`);
