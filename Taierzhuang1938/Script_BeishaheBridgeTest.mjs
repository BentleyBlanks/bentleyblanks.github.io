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
  const colorIndex=primitive.attributes.COLOR_0;
  const color=colorIndex==null?null:ReadAccessor(glb,colorIndex);
  if(color){
    Check(color.count===positions.count&&(color.width===3||color.width===4),'Vertex colors match the real mesh vertices');
    const accessor=g.accessors[colorIndex];
    if(accessor.normalized&&accessor.componentType!==5126){
      const divisor={5121:255,5123:65535}[accessor.componentType];
      Check(divisor,'Vertex color integer encoding has a supported normalization',accessor.componentType);
      for(let i=0;i<color.data.length;i++)color.data[i]/=divisor;
    }
  }
  if(!uv)uvMissing++;
  Check(normals&&normals.count===positions.count,'Every exported mesh has vertex normals');
  for(let i=0;i<normals.data.length;i+=3)normalError=Math.max(normalError,Math.abs(Math.hypot(normals.data[i],normals.data[i+1],normals.data[i+2])-1));
  const localBounds=new THREE.Box3();for(let i=0;i<positions.data.length;i+=3){const p=new THREE.Vector3(positions.data[i],positions.data[i+1],positions.data[i+2]);if(!p.toArray().every(Number.isFinite))nonFinite++;localBounds.expandByPoint(p);}
  if(uv)Check([...uv.data].every(Number.isFinite),'UV coordinates are finite');
  const at=(i)=>new THREE.Vector3(positions.data[i*3],positions.data[i*3+1],positions.data[i*3+2]);
  for(let i=0;i<(indices?.length??positions.count);i+=3){const a=at(indices?indices[i]:i),b=at(indices?indices[i+1]:i+1),c=at(indices?indices[i+2]:i+2);if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)degenerate++;}
  const result={positions:positions.data,indices,uv:uv?.data,color:color?.data,colorWidth:color?.width,localBounds,triangles:(indices?.length??positions.count)/3};geometryCache.set(primitive,result);return result;
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

// Material records and decoded pixels are checked independently of screenshots.
// The running surface is intentionally a textureless polished metal, while all
// six weathered materials must keep their independent Base/Normal/ORM maps.
const materialSources={BeishaheSteel:'BeishaheSteel',BeishaheTimber:'BeishaheSleeper',BeishaheTimberEnd:'BeishaheSleeperEnd',BeishaheDeckTimber:'BeishaheDeckPlank',BeishaheStone:'BeishahePierStone',BeishaheStoneDamp:'BeishahePierDamp'};
const expectedMaterials=[...Object.keys(materialSources),'BeishaheRailRunning'];
Check(g.materials?.length===expectedMaterials.length&&expectedMaterials.every(name=>g.materials.some(m=>m.name===name)),'Six distinct PBR materials and the single polished rail material exist');
Check(g.images?.length===18,'Six independent three-channel PBR texture sets are embedded',g.images?.length);
const imageStats=[];
const decodedImages=new Map();
for(const [i,image] of g.images.entries()){
  let payload;
  if(image.bufferView!=null){const bv=g.bufferViews[image.bufferView];payload=glb.bin.subarray(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength);}
  else{Check(image.uri&&!/^(https?:|data:)/i.test(image.uri),'External texture is an ordinary local asset',image.uri);payload=fs.readFileSync(path.resolve(path.dirname(file),image.uri));}
  const decoded=await sharp(payload).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const meta=decoded.info;
  Check(meta.width>=16&&meta.height>=16&&meta.width<=8192&&meta.height<=8192,'Every image decodes at its authored resolution',{index:i,width:meta.width,height:meta.height});
  Check(meta.channels===3,'Every PBR image has RGB pixel data',i);
  decodedImages.set(i,decoded);
  imageStats.push({index:i,width:meta.width,height:meta.height,sha256:Hash(payload)});
}
function ImageForTexture(index){const tx=g.textures?.[index];const source=tx?.source??tx?.extensions?.EXT_texture_webp?.source;Check(Number.isInteger(source)&&decodedImages.has(source),'Material texture points to a decoded image',index);return {source,...decodedImages.get(source)};}
async function CheckTexturePixels(material,label,index,sourceName,channels){
  const embedded=ImageForTexture(index),sourcePath=path.join(here,'Texture',`Texture_${sourceName}${label}.webp`);
  Check(fs.existsSync(sourcePath),'Baked source texture exists',sourcePath);
  const original=await sharp(sourcePath).removeAlpha().raw().toBuffer({resolveWithObject:true});
  Check(original.info.width===embedded.info.width&&original.info.height===embedded.info.height&&original.info.channels===3,'Embedded texture retains source dimensions and RGB channels',{material,label});
  const pixels=original.info.width*original.info.height;
  let mismatch=0;
  for(let i=0;i<pixels;i++)for(const channel of channels)if(embedded.data[i*3+channel]!==original.data[i*3+channel])mismatch++;
  Check(mismatch===0,'GLB decodes to current baked pixels in every used material channel',{material,label,channels,mismatch});
  return embedded;
}
const baseImages=new Set(),normalImages=new Set(),ormImages=new Set();
for(const m of g.materials){
  const p=m.pbrMetallicRoughness;
  Check(p,'Physical material has a metallic-roughness record',m.name);
  Check(!m.extensions?.KHR_materials_unlit&&(m.alphaMode??'OPAQUE')==='OPAQUE','Bridge physical surfaces are opaque lit PBR',m.name);
  Check(m.doubleSided!==true,'Bridge materials use outward-facing surfaces and backface culling',m.name);
  for(const v of [p.metallicFactor??1,p.roughnessFactor??1])Check(Number.isFinite(v)&&v>=0&&v<=1,'Material factors stay physical',m.name);
  if(m.name==='BeishaheRailRunning'){
    Check(!p.baseColorTexture&&!p.metallicRoughnessTexture&&!m.normalTexture&&!m.occlusionTexture,'Only polished wheel-contact steel uses a constant material');
    Check((p.metallicFactor??1)>=.8&&(p.roughnessFactor??1)<=.4,'Wheel-contact strip is physically metallic and polished',p);
    const rgb=p.baseColorFactor?.slice(0,3)??[1,1,1];
    Check(rgb.every(v=>v>.1&&v<.8)&&Math.max(...rgb)-Math.min(...rgb)<.08,'Wheel-contact strip is neutral steel, not rust or a white painted line',rgb);
    continue;
  }
  const source=materialSources[m.name];
  Check(source&&p.baseColorTexture&&m.normalTexture&&p.metallicRoughnessTexture&&m.occlusionTexture,'Every weathered material retains Base, Normal, roughness and occlusion',m.name);
  const base=await CheckTexturePixels(m.name,'Base',p.baseColorTexture.index,source,[0,1,2]);
  const normal=await CheckTexturePixels(m.name,'Normal',m.normalTexture.index,source,[0,1,2]);
  // Blender repacks unused B to 255 for nonmetallic materials; their zero
  // metallicFactor makes that channel irrelevant. Steel uses the original B.
  const orm=await CheckTexturePixels(m.name,'Orm',p.metallicRoughnessTexture.index,source,m.name==='BeishaheSteel'?[0,1,2]:[0,1]);
  await CheckTexturePixels(m.name,'Orm',m.occlusionTexture.index,source,[0]);
  if(m.name!=='BeishaheSteel')Check((p.metallicFactor??1)===0,'Wood and masonry do not become metallic after ORM repacking',m.name);
  baseImages.add(base.source);normalImages.add(normal.source);ormImages.add(orm.source);
  let sum=0,sum2=0;const pixels=normal.info.width*normal.info.height;
  for(let i=0;i<pixels;i++){const v=normal.data[i*3];sum+=v;sum2+=v*v;}
  const effectiveRms=Math.sqrt(Math.max(0,sum2/pixels-(sum/pixels)**2))*(m.normalTexture.scale??1);
  Check(effectiveRms>2,'Effective normal map relief remains visibly non-flat',{material:m.name,effectiveRms});
}
Check(baseImages.size===6&&normalImages.size===6&&ormImages.size===6,'Steel, sleepers, end grain, decking, dry and damp stone use distinct image data');

Check(spec.schemaVersion===1&&data.schemaVersion===1&&data.version===spec.version,'Spec and sidecar schema/version agree');
Check(spec.units==='m'&&spec.lengthM===280&&spec.spanCount===14&&spec.spanPitchM===20&&spec.gaugeM===1.435,'Authorized metric design: fourteen 20 m spans and standard inner rail gauge');
Check(JSON.stringify(data.spec)===JSON.stringify(spec),'Shipped sidecar embeds the current source spec');
Check(data.glbSha256===Hash(bytes)&&data.glbBytes===bytes.length&&data.triangles===triangles,'Sidecar identifies these actual GLB bytes and rendered triangles');
for(const [key,actual] of [['min',bounds.min.toArray()],['max',bounds.max.toArray()],['size',size.toArray()]])Check(Array.isArray(data.bounds?.[key])&&actual.every((v,i)=>Math.abs(v-data.bounds[key][i])<.002),'Baker bounds independently match world-space exported vertices',key);
Check(typeof data.reconstructionScope==='string'&&/not a proven 1938 bridge length/i.test(data.reconstructionScope)&&/44 m/.test(data.reconstructionScope),'Asset explicitly distinguishes modern-scale reconstruction from proven 1938 bridge geometry');
Check(data.historicalReferences?.length>=3&&data.historicalReferences.every(r=>/^https:\/\//.test(r.url)&&r.supports),'Historical reference scope remains attached to the asset');
Check(/creative weathering choice, not evidence of the 1938 waterline/i.test(data.materialInterpretation?.pierDamp??''),'Lower pier damp color remains explicitly an artistic choice, not a historical water-level claim');
Check(/not established by a confirmed 1938 Beishahe bridge photograph/i.test(data.materialInterpretation?.deckPlanks??''),'Continuous wooden decking is identified as an authored reconstruction');
Check(data.deck?.clearWidthM===spec.sleeperLengthM&&data.deck.plankThicknessM===.045&&data.deck.topY===.075&&data.deck.jointWidthM===.006&&data.deck.grainAxis==='X','Decking dimensions, real 6 mm board gaps and transverse timber grain are recorded');
const Role=p=>p.node.extras?.role;
const ByRole=(role,index)=>parts.filter(p=>Role(p)===role&&(index==null||p.node.extras?.spanIndex===index));
for(const part of parts){
  const name=g.materials[part.primitive.material]?.name,role=Role(part);
  if(name==='BeishaheRailRunning'||role==='RailWear'||role==='RailJointWear')Check(name==='BeishaheRailRunning'&&(role==='RailWear'||role==='RailJointWear'),'Polished steel is restricted to dedicated rail-wear geometry',{name,role});
}
const pointCache=new Map();
function Points(part){if(pointCache.has(part))return pointCache.get(part);const out=[];for(let i=0;i<part.geo.positions.length;i+=3)out.push(new THREE.Vector3(part.geo.positions[i],part.geo.positions[i+1],part.geo.positions[i+2]).applyMatrix4(part.matrix));pointCache.set(part,out);return out;}
function PartBounds(list){const box=new THREE.Box3();for(const p of list)box.union(p.bounds);return box;}
function SubBounds(points,predicate){const box=new THREE.Box3();for(const p of points)if(predicate(p))box.expandByPoint(p);return box;}
const rayMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),rayCache=new Map();
function RayMesh(part){if(rayCache.has(part))return rayCache.get(part);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(part.geo.positions,3));if(part.geo.indices)geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(part.geo.indices),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,rayMaterial);mesh.matrixAutoUpdate=false;mesh.matrix.copy(part.matrix);mesh.updateMatrixWorld(true);rayCache.set(part,mesh);return mesh;}
function Hits(list,origin,direction,far){const ray=new THREE.Raycaster(origin,direction,0,far);const hits=[];for(const part of list)if(ray.ray.intersectsBox(part.bounds))RayMesh(part).raycast(ray,hits);return hits.sort((a,b)=>a.distance-b.distance);}
Check(ByRole('Pier').length===spec.spanCount-1&&ByRole('PierDamp').length===spec.spanCount-1&&ByRole('Cap').length===spec.spanCount-1&&ByRole('abutment').length===2,'Thirteen piers each contain solid masonry, damp stones and a cap, plus two abutments');
Check(data.assemblies?.length===14,'Sidecar inventories exactly fourteen intact spans');
// The bridge abutment is load-bearing masonry, not a collection of loose
// facing stones. Probe the actual two-sided GLB mesh through every central
// vertical joint, offsets within the gaps, and several horizontal joints.
// Both ray directions must hit distinct front and back faces of solid backing.
for(const [label,bridgeSide] of [['North',-1],['South',1]]){
  const abutments=ByRole('abutment').filter(p=>(p.node.name??'').endsWith(label));
  Check(abutments.length===1,'One actual GLB abutment exists at each bridge end',label);
  const centerZ=bridgeSide*spec.lengthM/2,course=(spec.pierTopY-spec.foundationY)/10;
  const sampleY=[-2,...[2,4,6,8].map(row=>spec.foundationY+row*course)];
  for(const faceSide of [-1,1]){
    const direction=new THREE.Vector3(0,0,-faceSide);
    for(const y of sampleY)for(let column=1;column<8;column++)for(const offset of [-.006,0,.006]){
      const x=-3+column*.75+offset;
      const hits=Hits(abutments,new THREE.Vector3(x,y,centerZ+faceSide*4.5),direction,9);
      const depths=[];for(const hit of hits)if(!depths.length||hit.distance-depths[depths.length-1]>.025)depths.push(hit.distance);
      Check(depths.length>=2&&depths[depths.length-1]-depths[0]>=1.20,'No through-holes at a masonry joint from either face',{label,faceSide,x,y,depths});
    }
    // Facing stones must still project in front of the recessed core: sealing
    // the wall cannot be accomplished with a flat sheet over the joints.
    const gap=Hits(abutments,new THREE.Vector3(0,-2,centerZ+faceSide*4.5),direction,9);
    const stone=Hits(abutments,new THREE.Vector3(.375,-2,centerZ+faceSide*4.5),direction,9);
    Check(gap.length>0&&stone.length>0&&gap[0].distance-stone[0].distance>.03&&gap[0].distance-stone[0].distance<.15,'Visible masonry joint remains recessed behind the stone face',{label,faceSide,gap:gap[0]?.distance,stone:stone[0]?.distance});
  }
  // Probe the physical joint relief on both faces of each sloped wing, not a
  // painted texture. Local X/Z are transformed by the actual GLB node matrix.
  const wallPart=abutments[0],wallMatrix=wallPart.matrix;
  for(const wingSide of [-1,1]){
    const start=new THREE.Vector3(wingSide*2.85,0,.8),end=new THREE.Vector3(wingSide*4.52,0,3.7);
    const axis=end.clone().sub(start),wallLength=axis.length();axis.normalize();
    const normal=new THREE.Vector3(axis.z,0,-axis.x);
    function WingHits(t,y,faceSide){
      const origin=start.clone().addScaledVector(axis,wallLength*t);origin.y=y;
      origin.addScaledVector(normal,faceSide*.7).applyMatrix4(wallMatrix);
      const direction=normal.clone().multiplyScalar(-faceSide).transformDirection(wallMatrix);
      return Hits(abutments,origin,direction,1.5);
    }
    const evenY=spec.foundationY+2.5*(spec.pierTopY-spec.foundationY)/9;
    for(const faceSide of [-1,1]){
      const seam=WingHits(.5,evenY,faceSide),stone=WingHits(2.5/6,evenY,faceSide);
      Check(seam.length>0&&stone.length>0&&seam[0].distance-stone[0].distance>.009&&seam[0].distance-stone[0].distance<.035,'Each wing facade has real recessed joints on both sides',{label,wingSide,faceSide,seam:seam[0]?.distance,stone:stone[0]?.distance});
    }
    const oddY=spec.foundationY+1.5*(spec.pierTopY-spec.foundationY)/9;
    const firstHalfBlock=WingHits(.04,oddY,wingSide);
    Check(firstHalfBlock.length>0&&Math.abs(firstHalfBlock[0].distance-.3725)<.009,'Staggered wing courses include the exposed half-block at the abutment end',{label,wingSide,distance:firstHalfBlock[0]?.distance});
  }
}
// Three actual pier variants previously had individually stacked core blocks
// with a 12 mm through-gap at each course. Probe the complete solid backing
// from both river faces at every horizontal joint and points just either side.
rayMaterial.side=THREE.FrontSide;
for(const supportIndex of [1,2,3]){
  const dry=ByRole('Pier').filter(p=>p.node.extras?.supportIndex===supportIndex);
  const damp=ByRole('PierDamp').filter(p=>p.node.extras?.supportIndex===supportIndex);
  const caps=ByRole('Cap').filter(p=>p.node.extras?.supportIndex===supportIndex);
  Check(dry.length===1&&damp.length===1&&caps.length===1,'Each tested pier has dry core, damp stones and cap',{supportIndex});
  const centerZ=-spec.lengthM/2+supportIndex*spec.spanPitchM;
  const course=(spec.pierTopY-spec.foundationY-.25)/9;
  for(const faceSide of [-1,1]){
    const direction=new THREE.Vector3(0,0,-faceSide);
    for(let row=1;row<9;row++)for(const x of [-1.5,-1,-.5,0,.5,1,1.5])for(const delta of [-.002,0,.002]){
      const y=spec.foundationY+row*course+delta,origin=new THREE.Vector3(x,y,centerZ+faceSide*3);
      Check(Hits(dry,origin,direction,6).length>0,'Continuous inset pier core blocks a horizontal-joint ray from either face',{supportIndex,faceSide,row,x,delta});
      Check(Hits([...dry,...damp],origin,direction,6).length>0,'Visible dry/damp pier assembly has no joint through-hole',{supportIndex,faceSide,row,x,delta});
    }
    // A real 7–20 cm recessed gap remains between the core and dressed stone.
    const y=spec.foundationY+4*course,originZ=centerZ+faceSide*3;
    const seam=Hits([...dry,...damp],new THREE.Vector3(.3,y,originZ),direction,6);
    const stone=Hits([...dry,...damp],new THREE.Vector3(.3,y+.08,originZ),direction,6);
    Check(seam.length>0&&stone.length>0&&seam[0].distance-stone[0].distance>.04&&seam[0].distance-stone[0].distance<.28,'Pier horizontal joint stays recessed while the core remains solid',{supportIndex,faceSide,seam:seam[0]?.distance,stone:stone[0]?.distance});
  }
  const core=PartBounds(dry),cap=PartBounds(caps);
  Check(Math.abs(core.max.y-cap.min.y)<.002,'Continuous pier core touches the underside of the cap',{supportIndex,coreTop:core.max.y,capBottom:cap.min.y});
  const dampBox=PartBounds(damp);
  Check(dampBox.min.y>=spec.foundationY-.02&&dampBox.max.y<=spec.foundationY+3*course+.02,'Distinct damp-material stones occur only in the lowest three courses',{supportIndex,min:dampBox.min.y,max:dampBox.max.y});
}
rayMaterial.side=THREE.DoubleSide;
Check(new Set(ByRole('Sleepers').map(p=>p.node.mesh)).size===3&&new Set(ByRole('DeckPlanks').map(p=>p.node.mesh)).size===3&&new Set(ByRole('Pier').map(p=>p.node.mesh)).size===3&&new Set(ByRole('PierDamp').map(p=>p.node.mesh)).size===3,'Three real geometry/UV variants break sleeper, deck and dry/damp pier repetition');
function UniqueUvCount(role){return new Set(ByRole(role).map(part=>Hash(Buffer.from(part.geo.uv.buffer,part.geo.uv.byteOffset,part.geo.uv.byteLength)))).size;}
Check(UniqueUvCount('Sleepers')===3&&UniqueUvCount('DeckPlanks')===3&&UniqueUvCount('Pier')===3&&UniqueUvCount('PierDamp')===3,'Three mesh variants contain genuinely different UV coordinates');
for(const role of ['Pier','PierDamp','Cap','abutment']){
  const meshes=[...new Map(ByRole(role).map(p=>[p.node.mesh,p])).values()];
  const tints=new Set();let min=1,max=0,invalid=0,alphaBad=0,mixedFaces=0;
  for(const part of meshes){
    const {color,colorWidth,indices,positions}=part.geo;
    const expectedMaterial=role==='PierDamp'?'BeishaheStoneDamp':'BeishaheStone';
    Check(color&&colorWidth>=3&&g.materials[part.primitive.material]?.name===expectedMaterial,'Each masonry mesh exports its specific dry/damp PBR material with vertex tint',role);
    for(let i=0;i<color.length;i+=colorWidth){
      const rgb=[color[i],color[i+1],color[i+2]];
      const y=positions[(i/colorWidth)*3+1],course=(spec.pierTopY-spec.foundationY-.25)/9;
      const lowerBound=(role==='Pier'&&y<spec.foundationY+4.2*course) ? .70 : role==='PierDamp' ? .78 : .80;
      if(!rgb.every(v=>Number.isFinite(v)&&v>=lowerBound&&v<=1.001))invalid++;
      min=Math.min(min,...rgb);max=Math.max(max,...rgb);tints.add(rgb.map(v=>Math.round(v*10000)).join(','));
      if(colorWidth===4&&Math.abs(color[i+3]-1)>=.001)alphaBad++;
    }
    // Cap/abutment tint stays constant per actual triangle. Pier stone uses
    // a bounded height-based gradient; reject artificial lateral tint jumps.
    for(let k=0;k<(indices?.length??positions.length/3);k+=3){
      const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j);
      for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]])for(let c=0;c<3;c++){
        const delta=Math.abs(color[a*colorWidth+c]-color[b*colorWidth+c]);
        const permitted=(role==='Pier'||role==='PierDamp') ? .90*Math.abs(positions[a*3+1]-positions[b*3+1])+.03 : .001;
        if(delta>permitted)mixedFaces++;
      }
    }
  }
  Check(invalid===0&&alphaBad===0,'Masonry tint is mild, finite and opaque',{role,invalid,alphaBad});
  Check(mixedFaces===0,'Masonry color varies smoothly without fake lateral seams',{role,mixedFaces});
  const maxRange=role==='Pier' ? .31 : role==='PierDamp' ? .25 : .21;
  Check(tints.size>=(role==='Cap'?3:12)&&max-min>.04&&max-min<maxRange,'Masonry has visible but restrained deterministic color variation',{role,unique:tints.size,min,max});
}
{
  let bottomWarmth=0,upperWarmth=0,bottomCount=0,upperCount=0,warm=0,cool=0;
  for(const part of [...new Map([...ByRole('Pier'),...ByRole('PierDamp')].map(p=>[p.node.mesh,p])).values()]){
    const {positions,color,colorWidth}=part.geo;
    for(let i=0;i<positions.length/3;i++){
      const y=positions[i*3+1],warmth=color[i*colorWidth]-color[i*colorWidth+2];
      if(warmth>.015)warm++;if(warmth<-.015)cool++;
      if(y<spec.foundationY+(spec.pierTopY-spec.foundationY)*.30){bottomWarmth+=warmth;bottomCount++;}
      if(y>spec.foundationY+(spec.pierTopY-spec.foundationY)*.62){upperWarmth+=warmth;upperCount++;}
    }
  }
  Check(bottomCount>100&&upperCount>100&&warm>100&&cool>100,'Pier stones contain varied cool and warm individual tones',{bottomCount,upperCount,warm,cool});
  Check(bottomWarmth/bottomCount-upperWarmth/upperCount>.01,'Lower courses show scattered warm-gray damp character compared with upper courses',{bottom:bottomWarmth/bottomCount,upper:upperWarmth/upperCount});
}
{
  const course=(spec.pierTopY-spec.foundationY-.25)/9,transition=spec.foundationY+3*course;
  for(const supportIndex of [1,2,3]){
    const dry=ByRole('Pier').filter(p=>p.node.extras?.supportIndex===supportIndex),damp=ByRole('PierDamp').filter(p=>p.node.extras?.supportIndex===supportIndex);
    const centerZ=-spec.lengthM/2+supportIndex*spec.spanPitchM;
    for(const faceSide of [-1,1])for(const row of [0,1]){
      const y=spec.foundationY+(row+.5)*course,direction=new THREE.Vector3(0,0,-faceSide);let wetVisible=0;
      for(let k=0;k<25;k++){
        const origin=new THREE.Vector3(-1.5+k*.125,y,centerZ+faceSide*3);
        const all=Hits([...dry,...damp],origin,direction,6),wet=Hits(damp,origin,direction,6);
        if(wet.length&&all.length&&wet[0].distance<=all[0].distance+.002)wetVisible++;
      }
      Check(wetVisible>=20,'Both lower courses form a continuous visible damp band apart from physical joints',{supportIndex,faceSide,row,wetVisible});
    }
  }
  function AvgTint(parts,predicate){
    const sum=[0,0,0];let count=0;
    for(const part of [...new Map(parts.map(p=>[p.node.mesh,p])).values()]){
      const {positions,color,colorWidth}=part.geo;
      for(let i=0;i<positions.length/3;i++)if(predicate(positions[i*3+1])){for(let c=0;c<3;c++)sum[c]+=color[i*colorWidth+c];count++;}
    }
    Check(count>50,'Measured gradient zone has actual colored geometry',count);
    return sum.map(x=>x/count);
  }
  const lower=AvgTint(ByRole('PierDamp'),y=>y<spec.foundationY+.7*course);
  const wetTop=AvgTint(ByRole('PierDamp'),y=>y>transition-.07&&y<transition+.02);
  const dryBottom=AvgTint(ByRole('Pier'),y=>y>transition-.02&&y<transition+.07);
  const mean=rgb=>(rgb[0]+rgb[1]+rgb[2])/3;
  Check(mean(wetTop)-mean(lower)>.07,'Actual damp vertex colors become lighter continuously towards the dry transition',{lower,wetTop});
  function BaseLinear(name){
    const material=g.materials.find(m=>m.name===name),im=ImageForTexture(material.pbrMetallicRoughness.baseColorTexture.index),sum=[0,0,0],n=im.info.width*im.info.height;
    for(let i=0;i<n;i++)for(let c=0;c<3;c++){const x=im.data[i*3+c]/255;sum[c]+=x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}
    return sum.map(x=>x/n);
  }
  const wetBase=BaseLinear('BeishaheStoneDamp'),dryBase=BaseLinear('BeishaheStone');
  const lum=(base,tint)=>base[0]*tint[0]*.2126+base[1]*tint[1]*.7152+base[2]*tint[2]*.0722;
  const a=lum(wetBase,wetTop),b=lum(dryBase,dryBottom),relative=Math.abs(a-b)/Math.max(a,b);
  Check(relative<.30,'Wet and dry PBR/material colors approach one another at the actual transition',{wet:a,dry:b,relative});
}
// On every sleeper variant, find real top-face edges along the long X axis.
// Generated timber grain runs along the image V axis, so U must stay constant
// and |dV| must equal the measured |dX| for the one-metre texture scale.
for(const part of [...new Map(ByRole('Sleepers').map(p=>[p.node.mesh,p])).values()]){
  const {positions,indices,uv}=part.geo;let edges=0;
  for(let k=0;k<(indices?.length??positions.length/3);k+=3){
    const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j);
    for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){
      const dx=Math.abs(positions[a*3]-positions[b*3]),dz=Math.abs(positions[a*3+2]-positions[b*3+2]);
      if(dx<.5||dz>.0001||Math.abs(positions[a*3+1])>.0001||Math.abs(positions[b*3+1])>.0001)continue;
      const du=Math.abs(uv[a*2]-uv[b*2]),dv=Math.abs(uv[a*2+1]-uv[b*2+1]);
      Check(du<.001&&Math.abs(dv-dx)<.001,'Actual top-face UV sends long timber grain along sleeper X',{du,dv,dx});edges++;
    }
  }
  Check(edges>=30,'Every sleeper variant exposes enough individually grain-aligned top faces',edges);
}
// Transverse deck texture uses image V along world X. Independently examine
// actual top-face triangle edges and verify no triangle intrudes into either
// 130 mm rail-foot footprint.
for(const part of [...new Map(ByRole('DeckPlanks').map(p=>[p.node.mesh,p])).values()]){
  const {positions,indices,uv,color,colorWidth}=part.geo;let edges=0,footIntrusions=0;
  Check(g.materials[part.primitive.material]?.name==='BeishaheDeckTimber','Deck boards use the separate authored deck PBR texture');
  Check(color&&colorWidth>=3,'Actual deck board mesh contains exported COLOR_0 tint');
  const railCenter=(spec.gaugeM+spec.railHeadWidthM)/2;
  const length=spec.spanPitchM-spec.expansionGapM,boardCount=Math.ceil(length/.185),rows=new Map(),sideFaces=[];
  for(let k=0;k<(indices?.length??positions.length/3);k+=3){
    const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j);
    const xs=ids.map(i=>positions[i*3]),xmin=Math.min(...xs),xmax=Math.max(...xs);
    for(const rail of [-railCenter,railCenter])if(xmin<rail+.0649&&xmax>rail-.0649)footIntrusions++;
    if(xmax-xmin>.3&&ids.every(i=>Math.abs(positions[i*3+1]-.075)<.0001)){
      const z=ids.reduce((sum,i)=>sum+positions[i*3+2],0)/3,row=Math.max(0,Math.min(boardCount-1,Math.floor((z+length/2)*boardCount/length)));
      const x=ids.reduce((sum,i)=>sum+positions[i*3],0)/3,zone=x<-.65?'left':x>.65?'right':'center';
      const rgb=ids.slice(0,1).map(i=>[color[i*colorWidth],color[i*colorWidth+1],color[i*colorWidth+2]])[0];
      Check(ids.every(i=>rgb.every((v,c)=>Math.abs(v-color[i*colorWidth+c])<.001)),'Each transverse board has a uniform tint over its physical surface',{row,zone});
      const phase=[uv[ids[0]*2]-positions[ids[0]*3+2],uv[ids[0]*2+1]+positions[ids[0]*3]];
      if(!rows.has(row))rows.set(row,{rgb,phase,zones:new Set()});
      const previous=rows.get(row);
      Check(rgb.every((v,c)=>Math.abs(v-previous.rgb[c])<.001)&&phase.every((v,c)=>Math.abs(v-previous.phase[c])<.001),'Three rail-separated pieces of one row share tint and texture phase',{row,zone});
      previous.zones.add(zone);
    }
    const ys=ids.map(i=>positions[i*3+1]),zs=ids.map(i=>positions[i*3+2]);
    if(xmax-xmin>.3&&Math.max(...ys)-Math.min(...ys)>.02&&Math.max(...zs)-Math.min(...zs)<.0001){
      const z=zs.reduce((a,b)=>a+b,0)/3,row=Math.max(0,Math.min(boardCount-1,Math.floor((z+length/2)*boardCount/length)));
      sideFaces.push({row,rgb:[color[ids[0]*colorWidth],color[ids[0]*colorWidth+1],color[ids[0]*colorWidth+2]]});
    }
    for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){
      const dx=Math.abs(positions[a*3]-positions[b*3]),dz=Math.abs(positions[a*3+2]-positions[b*3+2]);
      if(dx<.3||dz>.0001||Math.abs(positions[a*3+1]-.075)>.0001||Math.abs(positions[b*3+1]-.075)>.0001)continue;
      const du=Math.abs(uv[a*2]-uv[b*2]),dv=Math.abs(uv[a*2+1]-uv[b*2+1]);
      Check(du<.001&&Math.abs(dv-dx)<.001,'Deck top-face grain follows each transverse plank X axis',{du,dv,dx});edges++;
    }
  }
  Check(footIntrusions===0,'No physical deck triangle intrudes into either steel rail foot',footIntrusions);
  Check(edges>=20,'Each deck variant has enough real grain-aligned transverse plank tops',edges);
  Check(rows.size===boardCount&&[...rows.values()].every(r=>r.zones.size===3),'Every transverse row contains all three visible pieces',rows.size);
  const tones=[...rows.values()].map(r=>r.rgb),values=tones.map(rgb=>(rgb[0]+rgb[1]+rgb[2])/3);
  Check(new Set(tones.map(rgb=>rgb.map(x=>Math.round(x*10000)).join(','))).size>boardCount*.8&&Math.max(...values)-Math.min(...values)>.13&&Math.max(...values)-Math.min(...values)<.31&&tones.every(rgb=>rgb[0]>=rgb[2]&&rgb.every(v=>v>=.70&&v<=1.001)),'Different rows show visible but restrained deterministic warm-gray timber variation');
  Check(sideFaces.length>boardCount*3&&sideFaces.every(({row,rgb})=>rows.has(row)&&rgb.every((v,c)=>v<rows.get(row).rgb[c]*.90&&v>rows.get(row).rgb[c]*.82)),'Real board side faces are moderately darker than their own top faces',sideFaces.length);
}
for(const part of [...new Map(ByRole('DeckBearers').map(p=>[p.node.mesh,p])).values()]){
  const {color,colorWidth}=part.geo;
  Check(color&&colorWidth>=3&&color.every(v=>Math.abs(v-1)<.001),'Actual supporting bearers export neutral white vertex tint');
}
// End grain comes from a square image on a 0.24 x 0.16 m section. The same
// metre-to-UV scale on both axes preserves circular rings instead of stretching
// them into a 1.5x ellipse; shifted UV coordinates stay inside the image.
for(const part of [...new Map(ByRole('SleeperEnds').map(p=>[p.node.mesh,p])).values()]){
  const {positions,indices,uv}=part.geo;let widthEdges=0,heightEdges=0;
  Check([...uv].every(v=>v>=-.00001&&v<=1.00001),'End-grain UV remains within the square image rather than wrapping');
  for(let k=0;k<(indices?.length??positions.length/3);k+=3){
    const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j);
    for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){
      const dy=Math.abs(positions[a*3+1]-positions[b*3+1]),dz=Math.abs(positions[a*3+2]-positions[b*3+2]);
      const du=Math.abs(uv[a*2]-uv[b*2]),dv=Math.abs(uv[a*2+1]-uv[b*2+1]);
      if(dz>.05&&dy<.0001){Check(dv<.001&&Math.abs(du-dz/spec.sleeperWidthM)<.001,'End-grain width has equal physical UV scale',{du,dv,dz});widthEdges++;}
      if(dy>.05&&dz<.0001){Check(du<.001&&Math.abs(dv-dy/spec.sleeperWidthM)<.001,'End-grain height has the same physical UV scale',{du,dv,dy});heightEdges++;}
    }
  }
  Check(widthEdges>=60&&heightEdges>=60,'Both end-grain axes are checked across many sleeper ends',{widthEdges,heightEdges});
}
// Inspect each unique real rivet mesh rather than trusting the builder's
// spacing numbers. Each uninterrupted chord bay must have two rows on BOTH
// faces; node-plate footprints remain clear. A sampled dome in every row/bay
// must touch its actual steel cheek plate without protruding into it.
for(const rivets of [...new Map(ByRole('Rivets').map(p=>[p.node.mesh,p])).values()]){
  const span=rivets.node.extras.spanIndex,center=-spec.lengthM/2+spec.spanPitchM*(span+.5);
  const length=spec.spanPitchM-spec.expansionGapM,panel=length/spec.panelsPerSpan;
  const nodes=Array.from({length:spec.panelsPerSpan+1},(_,i)=>center-length/2+panel*i);
  const points=Points(rivets),trusses=ByRole('Trusses',span);
  for(const trussSide of [-1,1])for(const faceSign of [-1,1])for(const chord of [
    {name:'lower',y:spec.trussBottomY,contact:.125,rows:[-.05,.05],first:0,last:spec.panelsPerSpan-1},
    {name:'upper',y:spec.trussTopY,contact:.140,rows:[-.045,.045],first:1,last:spec.panelsPerSpan-2},
  ]){
    const faceX=trussSide*spec.trussCenterOffsetM+faceSign*chord.contact;
    const tipX=faceX+faceSign*.013;
    const grouped=[];
    for(const row of chord.rows){
      const y=chord.y+row;
      const apex=[...new Set(points.filter(p=>Math.abs(p.x-tipX)<.00015&&Math.abs(p.y-y)<.00015).map(p=>Math.round(p.z*10000)/10000))].sort((a,b)=>a-b);
      const base=points.filter(p=>Math.abs(p.x-faceX)<.00015&&Math.abs(p.y-y)<.00015).map(p=>p.z);
      const bays=[];
      for(let bay=chord.first;bay<=chord.last;bay++){
        const heads=apex.filter(z=>z>nodes[bay]+.219&&z<nodes[bay+1]-.219);
        Check(heads.length>=8,'Each exposed chord bay has a dense row of actual domed rivets',{span,trussSide,faceSign,chord:chord.name,row,bay,count:heads.length});
        for(let i=1;i<heads.length;i++)Check(heads[i]-heads[i-1]>.19&&heads[i]-heads[i-1]<.23,'Adjacent actual rivet heads have 0.20–0.22 m spacing',{span,trussSide,faceSign,chord:chord.name,row,bay,pitch:heads[i]-heads[i-1]});
        const z=heads[Math.floor(heads.length/2)];
        Check(base.some(v=>Math.abs(v-(z-.013))<.001)&&base.some(v=>Math.abs(v-(z+.013))<.001),'Domed rivet has a real circular foot on its plate',{span,trussSide,faceSign,chord:chord.name,row,bay,z});
        const footRegion=points.filter(p=>Math.abs(p.y-y)<=.0132&&Math.abs(p.z-z)<=.0132&&Math.abs(p.x-faceX)<=.0133);
        const protrusions=footRegion.map(p=>(p.x-faceX)*faceSign);
        Check(protrusions.length>0&&Math.min(...protrusions)>=-.0003&&Math.max(...protrusions)<=.0133,'Rivet head stays on the exposed side of the steel face',{span,trussSide,faceSign,chord:chord.name,row,bay});
        const hit=Hits(trusses,new THREE.Vector3(faceX+faceSign*.08,y,z),new THREE.Vector3(-faceSign,0,0),.12);
        Check(hit.length>0&&Math.abs(hit[0].point.x-faceX)<.002,'Rivet foot touches an actual exposed chord plate',{span,trussSide,faceSign,chord:chord.name,row,bay,faceX,hit:hit[0]?.point.x});
        bays.push(heads);
      }
      grouped.push(bays);
    }
    Check(grouped[0].length===grouped[1].length&&grouped[0].every((a,i)=>a.length===grouped[1][i].length&&a.every((z,j)=>Math.abs(z-grouped[1][i][j])<.001)),'Both actual rivet rows remain paired along each chord bay',{span,trussSide,faceSign,chord:chord.name});
  }
}
let bearingCount=0;
for(let i=0;i<spec.spanCount;i++){
  const center=-spec.lengthM/2+spec.spanPitchM*(i+.5),length=spec.spanPitchM-spec.expansionGapM;
  const trusses=ByRole('Trusses',i),sleepers=ByRole('Sleepers',i),ends=ByRole('SleeperEnds',i),planks=ByRole('DeckPlanks',i),bearers=ByRole('DeckBearers',i),west=ByRole('RailWest',i),east=ByRole('RailEast',i),wear=ByRole('RailWear',i),bearings=ByRole('Bearings',i);
  Check(trusses.length===1&&sleepers.length===1&&ends.length===1&&planks.length===1&&bearers.length===1&&west.length===1&&east.length===1&&wear.length===1&&bearings.length===1,'Span has independent truss, sleepers, actual wooden decking, its bearers, rails, wear and bearings',i+1);
  Check(data.assemblies[i].spanIndex===i&&Math.abs(data.assemblies[i].centerZ-center)<.0001&&data.assemblies[i].bearings.length===4,'Sidecar span location and four bearing inventory agree with metric layout',i+1);
  const w=Points(west[0]),e=Points(east[0]);
  const railCenter=(spec.gaugeM+spec.railHeadWidthM)/2;
  const wHead=SubBounds(w,p=>p.y>spec.railHeightM-.035),eHead=SubBounds(e,p=>p.y>spec.railHeightM-.035);
  Check(Math.abs(eHead.min.x-wHead.max.x-spec.gaugeM)<.0001,'Gauge is measured between the actual inner rail-head faces',i+1);
  for(const box of [wHead,eHead])Check(Math.abs(box.max.z-box.min.z-length)<.001&&Math.abs(box.max.x-box.min.x-spec.railHeadWidthM)<.001,'Actual rail head has full span length and section width',i+1);
  const sb=PartBounds(sleepers);Check(Math.abs(sb.max.y)<.0001&&Math.abs(sb.max.x-sb.min.x-spec.sleeperLengthM)<.001,'Sleeper top is the zero-height datum and retains physical width',i+1);
  const deckBounds=PartBounds(planks),bearerBounds=PartBounds(bearers);
  Check(Math.abs(deckBounds.min.y-.03)<.0001&&Math.abs(deckBounds.max.y-.075)<.0001&&Math.abs(deckBounds.max.x-deckBounds.min.x-spec.sleeperLengthM)<.001&&Math.abs(deckBounds.max.z-deckBounds.min.z-length)<.001,'Actual wooden deck covers the full 2.8 m bridge width, resting above sleeper-top bearers',i+1);
  Check(Math.abs(bearerBounds.min.y)<.001&&Math.abs(bearerBounds.max.y-.03)<.001,'Physical longitudinal bearers stand on sleepers and support transverse planks',i+1);
  Check(g.materials[planks[0].primitive.material]?.name==='BeishaheDeckTimber'&&g.materials[bearers[0].primitive.material]?.name==='BeishaheDeckTimber','Deck and supporting bearers use the authored deck material',i+1);
  const deckRivets=ByRole('Rivets',i),tieCount=Math.ceil(length/spec.sleeperSpacingM);
  const tieZ=k=>center-length/2+(k+.5)*length/tieCount;
  const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
  // Sample every span: the steel rail occupies its foot area; all remaining
  // walking regions must be wood, with only small physical joints allowed.
  let covered=0,samples=0,innerCovered=0,innerSamples=0,outerCovered=0,outerSamples=0;
  for(let zi=0;zi<12;zi++)for(let xi=0;xi<19;xi++){
    const z=center-length/2+(zi+.37)*length/12,x=-1.35+xi*.15;
    const hit=Hits([...planks,...west,...east],new THREE.Vector3(x,.25,z),down,.27).length>0;
    covered+=Number(hit);samples++;
    if(Math.abs(x)<=.6){innerCovered+=Number(hit);innerSamples++;}
    if(Math.abs(x)>=.9){outerCovered+=Number(hit);outerSamples++;}
  }
  Check(covered/samples>=.97&&innerCovered/innerSamples>=.97&&outerCovered/outerSamples>=.97,'Real visible wood and rail geometry cover the full inside/outside walking width',{span:i+1,covered,samples,innerCovered,innerSamples,outerCovered,outerSamples});
  const boardCount=Math.ceil(length/.185),seamZ=center-length/2+20*length/boardCount;
  const seam=Hits(planks,new THREE.Vector3(.4,.20,seamZ),down,.21);
  const before=Hits(planks,new THREE.Vector3(.4,.20,seamZ-.008),down,.21);
  const after=Hits(planks,new THREE.Vector3(.4,.20,seamZ+.008),down,.21);
  const innerBefore=Hits(planks,new THREE.Vector3(.4,.20,seamZ-.0025),down,.21),innerAfter=Hits(planks,new THREE.Vector3(.4,.20,seamZ+.0025),down,.21);
  Check(seam.length===0&&innerBefore.length===0&&innerAfter.length===0&&before.length>0&&after.length>0,'Deck has a genuine 6 mm transverse joint with wood on both sides',{span:i+1,z:seamZ});
  // Rail feet remain free of wood, and physical 1.5 mm clearance cutouts keep
  // both dog-spike heads visible from above. The back strip still joins the
  // neighbouring full-height edge boards rather than floating on its own.
  for(const rail of [-railCenter,railCenter]){
    Check(Hits(planks,new THREE.Vector3(rail,.20,center),down,.21).length===0,'Deck does not occupy the steel rail-foot channel',{span:i+1,rail});
    for(const sign of [-1,1])for(const k of [2,Math.floor(tieCount/2),tieCount-3])for(const dz of [-.055,.055]){
      const z=tieZ(k)+dz;
      for(const offset of [.060,.080]){
        const x=rail+sign*offset,origin=new THREE.Vector3(x,.20,z);
        const spike=Hits(deckRivets,origin,down,.20),all=Hits([...planks,...deckRivets,...west,...east],origin,down,.20);
        Check(spike.length>0&&all.length>0&&Math.abs(spike[0].point.y-.042)<.001&&Math.abs(all[0].distance-spike[0].distance)<.001,'Each real dog-spike head is the first visible surface from above',{span:i+1,rail,sign,k,dz,offset,spike:spike[0]?.point.y,first:all[0]?.point.y});
      }
      for(const offset of [.090,.105]){
        const wood=Hits(planks,new THREE.Vector3(rail+sign*offset,.20,z),down,.20);
        Check(wood.length>0&&Math.abs(wood[0].point.y-.075)<.001,'Narrow track-edge back strip remains covered by actual wood beside each spike',{span:i+1,rail,sign,k,dz,offset});
      }
    }
    for(const sign of [-1,1]){
      const z=tieZ(Math.floor(tieCount/2))+.055;
      const xInside=rail+sign*.0885,xOutside=rail+sign*.0900;
      Check(Hits(planks,new THREE.Vector3(xInside,.20,z),down,.20).length===0&&Hits(planks,new THREE.Vector3(xOutside,.20,z),down,.20).length>0,'Spike opening leaves 1–2 mm lateral clearance and a real adjacent board',{span:i+1,rail,sign});
      const x=rail+sign*.080,zInside=z+.0135,zOutside=z+.015;
      Check(Hits(planks,new THREE.Vector3(x,.20,zInside),down,.20).length===0&&Hits(planks,new THREE.Vector3(x,.20,zOutside),down,.20).length>0,'Spike opening leaves 1–2 mm lengthwise clearance and a real adjacent board',{span:i+1,rail,sign});
      const backX=rail+sign*.102,tie=tieZ(Math.floor(tieCount/2));
      for(const along of [-1,1]){
        const joins=Hits(planks,new THREE.Vector3(backX,.055,tie),new THREE.Vector3(0,0,along),.12);
        Check(joins.filter(hit=>Math.abs(hit.distance-.1005)<.001).length>=2,'Narrow backing strip physically butts against its neighbouring supported boards',{span:i+1,rail,sign,along,distances:joins.slice(0,3).map(h=>h.distance)});
      }
    }
  }
  // Each lengthwise support bears on the sleeper top; the transverse boards
  // sit on its upper face. The edge supports stay beyond the rail plates.
  for(const x of [-1.25,-.4,.4,1.25,-.87,-.63,.63,.87]){
    const z=tieZ(3),tie=Hits(sleepers,new THREE.Vector3(x,-.02,z),up,.04),bearer=Hits(bearers,new THREE.Vector3(x,-.02,z),up,.08);
    Check(tie.length>0&&bearer.length>0&&Math.abs(tie[0].point.y)<.001&&Math.abs(bearer[0].point.y-tie[0].point.y)<.001,'Lengthwise bearer rests on the actual sleeper top',{span:i+1,x,tie:tie[0]?.point.y,bearer:bearer[0]?.point.y});
  }
  let supported=0;
  for(const x of [-1.25,-.4,.4,1.25])for(let k=0;k<tieCount;k+=4){
    const z=tieZ(k),board=Hits(planks,new THREE.Vector3(x,.02,z),up,.10);
    if(!board.length)continue; // a deliberate small butt-joint over this tie
    const bearer=Hits(bearers,new THREE.Vector3(x,.02,z),up,.10);
    Check(bearer.length>0&&Math.abs(board[0].point.y-.03)<.001&&Math.abs(bearer[0].point.y-board[0].point.y)<.001,'Actual transverse plank underside rests on a lengthwise bearer',{span:i+1,x,k,board:board[0]?.point.y,bearer:bearer[0]?.point.y});supported++;
  }
  Check(supported>=15,'Each span has many measured plank-to-sleeper support contacts',{span:i+1,supported});
  const endPoints=Points(ends[0]);Check(endPoints.every(p=>Math.abs(Math.abs(p.x)-spec.sleeperLengthM/2)<.001)&&endPoints.some(p=>p.x<0)&&endPoints.some(p=>p.x>0),'End-grain geometry lies on both actual timber ends',i+1);
  Check(g.materials[ends[0].primitive.material]?.name==='BeishaheTimberEnd','End-grain geometry uses the separate end-grain PBR material',i+1);
  const wearPoints=Points(wear[0]);
  Check(wearPoints.every(p=>Math.abs(Math.abs(p.x)-railCenter)<=.0225&&p.y>=spec.railHeightM-.001&&p.y<=spec.railHeightM+.002),'Every polished point lies in a narrow strip directly on a rail head',i+1);
  for(const side of [-1,1]){
    const strip=SubBounds(wearPoints,p=>side*p.x>0);
    Check(!strip.isEmpty()&&Math.abs(strip.max.x-strip.min.x-.044)<.001&&Math.abs(strip.max.z-strip.min.z-length)<.001&&Math.abs(strip.min.y-spec.railHeightM)<.001,'Both full-length wheel-contact strips touch their rail heads',{span:i+1,side});
  }
  rayMaterial.side=THREE.FrontSide;
  const deckZ=center+.05,deckTop=Hits(planks,new THREE.Vector3(0,.20,deckZ),down,.21),deckUnder=Hits(planks,new THREE.Vector3(0,.02,deckZ),up,.10);
  Check(deckTop.length>0&&deckUnder.length>0&&Math.abs(deckTop[0].point.y-.075)<.001&&Math.abs(deckUnder[0].point.y-.03)<.001,'Deck has visible outward-facing top and underside, not a one-sided collision sheet',i+1);
  const firstSleeperZ=center-length/2+length/(2*Math.ceil(length/spec.sleeperSpacingM));
  for(const side of [-1,1]){
    Check(Hits(ends,new THREE.Vector3(side*(spec.sleeperLengthM/2+.2),-.08,firstSleeperZ),new THREE.Vector3(-side,0,0),.5).length>0,'End-grain face remains outward-visible with backface culling',{span:i+1,side});
    const nodeZ=center-length/2+length*2/spec.panelsPerSpan;
    Check(Hits(trusses,new THREE.Vector3(side*(spec.trussCenterOffsetM+.7),spec.trussTopY,nodeZ),new THREE.Vector3(-side,0,0),1.2).length>0,'Node plate is visible from the exterior with backface culling',{span:i+1,side});
    Check(Hits(trusses,new THREE.Vector3(0,spec.trussTopY,nodeZ),new THREE.Vector3(side,0,0),3).length>0,'Node plate is visible from inside the bridge with backface culling',{span:i+1,side});
    Check(Hits(wear,new THREE.Vector3(side*railCenter,.5,center),new THREE.Vector3(0,-1,0),1).length>0,'Polished rail top remains visible with backface culling',{span:i+1,side});
  }
  Check(Hits(trusses,new THREE.Vector3(.75,-1.5,center),new THREE.Vector3(0,1,0),2).length>0,'Floor members remain visible from beneath with backface culling',i+1);
  rayMaterial.side=THREE.DoubleSide;
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
}
Check(bearingCount===56,'All fifty-six span-end bearing load paths are inspected');
// Truss members still stop at each structural expansion joint. Separate real
// rail, wooden deck and bolted support meshes bridge those joints, with just
// 2 mm clearances at each end rather than a 120 mm walking/track discontinuity.
const transitionRoles=['RailJointWest','RailJointEast','RailJointWear','RailJointSplice','RailJointFasteners','DeckJoint','DeckJointSupport','DeckJointSplice','DeckJointBolts'];
for(const role of transitionRoles)Check(ByRole(role).length===spec.spanCount-1,'A real transition mesh exists at each intermediate pier',role);
Check(data.transitions?.length===spec.spanCount-1&&Math.abs(data.deck?.jointEndClearanceM-.002)<1e-9,'All 13 metric deck/track transitions are recorded');
Check(/not established by a confirmed 1938 Beishahe bridge photograph/i.test(data.materialInterpretation?.jointTransitions??''),'Pier transition details remain explicitly authored construction');
for(let supportIndex=1;supportIndex<spec.spanCount;supportIndex++){
  const centerZ=-spec.lengthM/2+supportIndex*spec.spanPitchM;
  const one=role=>ByRole(role).filter(p=>p.node.extras?.supportIndex===supportIndex);
  const railWest=one('RailJointWest'),railEast=one('RailJointEast'),railWear=one('RailJointWear'),railSplice=one('RailJointSplice'),railFasteners=one('RailJointFasteners'),deck=one('DeckJoint'),support=one('DeckJointSupport'),splice=one('DeckJointSplice'),bolts=one('DeckJointBolts');
  Check([railWest,railEast,railWear,railSplice,railFasteners,deck,support,splice,bolts].every(p=>p.length===1),'Pier has exactly one mesh per physical connection role',supportIndex);
  const info=data.transitions.find(t=>t.supportIndex===supportIndex);
  Check(info&&Math.abs(info.centerZ-centerZ)<.0001&&Math.abs(info.structuralGapM-.12)<.0001&&Math.abs(info.endClearanceM-.002)<.0001,'Transition record agrees with the metric bridge layout',supportIndex);
  const priorTruss=PartBounds(ByRole('Trusses',supportIndex-1)),nextTruss=PartBounds(ByRole('Trusses',supportIndex));
  Check(Math.abs((nextTruss.min.z-priorTruss.max.z)-spec.expansionGapM)<.001,'Actual steel trusses retain their 120 mm expansion gap without overlapping',{supportIndex,prior:priorTruss.max.z,next:nextTruss.min.z});
  for(const [role,joint] of [['RailWest',railWest],['RailEast',railEast],['DeckPlanks',deck]]){
    const prior=PartBounds(ByRole(role,supportIndex-1)),current=PartBounds(joint),next=PartBounds(ByRole(role,supportIndex));
    const northGap=current.min.z-prior.max.z,southGap=next.min.z-current.max.z;
    Check(northGap>.0015&&northGap<.0025&&southGap>.0015&&southGap<.0025,'Physical rail/deck transition leaves only millimetre end clearances',{supportIndex,role,northGap,southGap});
  }
  const westHead=SubBounds(Points(railWest[0]),p=>p.y>spec.railHeightM-.035),eastHead=SubBounds(Points(railEast[0]),p=>p.y>spec.railHeightM-.035);
  Check(Math.abs(eastHead.min.x-westHead.max.x-spec.gaugeM)<.0001&&Math.abs(westHead.max.y-spec.railHeightM)<.0001&&Math.abs(eastHead.max.y-spec.railHeightM)<.0001,'Pier rail inserts retain actual 1.435 m gauge and rail-head height',supportIndex);
  const wearBox=PartBounds(railWear);
  Check(Math.abs(wearBox.min.z-(centerZ-.058))<.001&&Math.abs(wearBox.max.z-(centerZ+.058))<.001&&Math.abs(wearBox.min.y-.14)<.001&&Math.abs(wearBox.max.y-.1408)<.001,'Polished rail running strips continue over the pier at the original rail height',supportIndex);
  const fishplateBounds=PartBounds(railSplice),fishHeadPoints=Points(railFasteners[0]);
  Check(Math.abs(fishplateBounds.min.z-(centerZ-.18))<.001&&Math.abs(fishplateBounds.max.z-(centerZ+.18))<.001,'Rail fishplates span the insert and overlap each neighbouring rail',supportIndex);
  for(const [rail,railName,joint] of [[-(spec.gaugeM+spec.railHeadWidthM)/2,'RailWest',railWest],[(spec.gaugeM+spec.railHeadWidthM)/2,'RailEast',railEast]])for(const face of [-1,1])for(const dz of [-.12,0,.12])for(const y of [.058,.086]){
    const z=centerZ+dz,selected=dz<0?ByRole(railName,supportIndex-1):dz>0?ByRole(railName,supportIndex):joint;
    const inside=new THREE.Vector3(rail,y,z),outward=new THREE.Vector3(face,0,0);
    const web=Hits(selected,inside,outward,.05),plate=Hits(railSplice,inside,outward,.05);
    Check(web.length>0&&plate.length>0&&Math.abs(web[0].distance-plate[0].distance)<.001,'Tapered fishplate inner face physically touches each rail web without a gap',{supportIndex,rail,face,dz,y,web:web[0]?.distance,plate:plate[0]?.distance});
    const outside=new THREE.Vector3(rail+face*.05,y,z),inward=new THREE.Vector3(-face,0,0);
    const head=Hits(railFasteners,outside,inward,.05),outerPlate=Hits(railSplice,outside,inward,.05);
    Check(head.length>0&&outerPlate.length>0&&face*(head[0].point.x-outerPlate[0].point.x)>.006&&face*(head[0].point.x-outerPlate[0].point.x)<.009,'Real rounded rivet head projects from the outer fishplate',{supportIndex,rail,face,dz,y});
    const foot=fishHeadPoints.some(p=>Math.abs(p.x-outerPlate[0].point.x)<.001&&Math.abs(p.y-y)<.0085&&Math.abs(p.z-z)<.0085);
    Check(foot,'Fishplate rivet foot actually contacts its plate',{supportIndex,rail,face,dz,y});
  }
  rayMaterial.side=THREE.FrontSide;
  for(const rail of [-(spec.gaugeM+spec.railHeadWidthM)/2,(spec.gaugeM+spec.railHeadWidthM)/2])for(const face of [-1,1]){
    const origin=new THREE.Vector3(rail+face*.05,.058,centerZ),direction=new THREE.Vector3(-face,0,0);
    Check(Hits(railSplice,origin,direction,.05).length>0&&Hits(railFasteners,origin,direction,.05).length>0,'Fishplates and their rivets remain outward-visible with backface culling',{supportIndex,rail,face});
  }
  rayMaterial.side=THREE.DoubleSide;
  const deckBox=PartBounds(deck),supportBox=PartBounds(support),spliceBox=PartBounds(splice),boltBox=PartBounds(bolts);
  Check(Math.abs(deckBox.max.x-deckBox.min.x-spec.sleeperLengthM)<.001&&Math.abs(deckBox.min.y-.03)<.001&&Math.abs(deckBox.max.y-.075)<.001,'Joint deck retains full width and matching physical top/bottom elevations',supportIndex);
  Check(Math.abs(supportBox.min.z-(centerZ-.06))<.001&&Math.abs(supportBox.max.z-(centerZ+.06))<.001&&Math.abs(supportBox.min.y)<.001&&Math.abs(supportBox.max.y-.03)<.001,'Wooden joint supports occupy exactly the truss gap',supportIndex);
  Check(Math.abs(spliceBox.min.z-(centerZ-.18))<.001&&Math.abs(spliceBox.max.z-(centerZ+.18))<.001&&Math.abs(spliceBox.max.y)<.001,'Steel plates overlap and support both neighbouring wooden bearer ends',supportIndex);
  Check(boltBox.min.y<=-.020&&boltBox.max.y>=.026,'Bolts extend through the splice plates into the wooden bearers',supportIndex);
  Check(g.materials[deck[0].primitive.material]?.name==='BeishaheDeckTimber'&&g.materials[support[0].primitive.material]?.name==='BeishaheDeckTimber'&&g.materials[splice[0].primitive.material]?.name==='BeishaheSteel','Physical wood and steel support roles use their correct materials',supportIndex);
  {
    const {positions,indices,uv,color,colorWidth}=deck[0].geo,railCenter=(spec.gaugeM+spec.railHeadWidthM)/2;
    let intrusions=0,edges=0;
    Check(color&&colorWidth>=3,'Joint deck retains real wood tint data',supportIndex);
    for(let k=0;k<(indices?.length??positions.length/3);k+=3){
      const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j),xs=ids.map(i=>positions[i*3]),xmin=Math.min(...xs),xmax=Math.max(...xs);
      for(const rail of [-railCenter,railCenter])if(xmin<rail+.0649&&xmax>rail-.0649)intrusions++;
      for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){
        const dx=Math.abs(positions[a*3]-positions[b*3]),dz=Math.abs(positions[a*3+2]-positions[b*3+2]);
        if(dx<.3||dz>.0001||Math.abs(positions[a*3+1]-.075)>.0001||Math.abs(positions[b*3+1]-.075)>.0001)continue;
        const du=Math.abs(uv[a*2]-uv[b*2]),dv=Math.abs(uv[a*2+1]-uv[b*2+1]);
        Check(du<.001&&Math.abs(dv-dx)<.001,'Joint board texture grain remains transverse across the pier',{supportIndex,du,dv,dx});edges++;
      }
    }
    Check(intrusions===0&&edges>=3,'Joint wood avoids both rail-foot channels and contains real transverse board surfaces',{supportIndex,intrusions,edges});
  }
  let covered=0,samples=0;
  for(const dz of [-.05,-.03,0,.03,.05])for(let xi=0;xi<19;xi++){
    const x=-1.35+xi*.15,hit=Hits([...deck,...railWest,...railEast],new THREE.Vector3(x,.25,centerZ+dz),new THREE.Vector3(0,-1,0),.27).length>0;
    covered+=Number(hit);samples++;
  }
  Check(covered/samples>=.97,'Visible solid decking and rails cover the crossing over each pier',{supportIndex,covered,samples});
  for(const dz of [-.059,.059])Check(Hits(deck,new THREE.Vector3(.4,.20,centerZ+dz),new THREE.Vector3(0,-1,0),.21).length===0,'Only a tiny intentional end clearance remains between deck pieces',{supportIndex,dz});
  for(const x of [-1.25,-.4,.4,1.25,-.87,-.63,.63,.87]){
    const origin=new THREE.Vector3(x,.02,centerZ),up=new THREE.Vector3(0,1,0);
    const board=Hits(deck,origin,up,.10),wood=Hits(support,origin,up,.10),plate=Hits(splice,new THREE.Vector3(x,-.03,centerZ),up,.05);
    Check(board.length>0&&wood.length>0&&Math.abs(board[0].point.y-wood[0].point.y)<.001&&Math.abs(wood[0].point.y-.03)<.001,'Joint board is seated on its real wooden bearer',{supportIndex,x,board:board[0]?.point.y,wood:wood[0]?.point.y});
    Check(plate.some(h=>Math.abs(h.point.y)<.001),'Bolted steel splice plate touches the underside of the joint bearer',{supportIndex,x});
    for(const [side,direction,role] of [[-1,1,'north'],[1,-1,'south']]){
      const o=new THREE.Vector3(x,.015,centerZ+side*.10),d=new THREE.Vector3(0,0,direction);
      const old=Hits(ByRole('DeckBearers',side<0?supportIndex-1:supportIndex),o,d,.12),fresh=Hits(support,o,d,.12);
      Check(old.length>0&&fresh.length>0&&Math.abs(old[0].point.z-fresh[0].point.z)<.001,'Joint support butts against the existing span bearer',{supportIndex,x,role,old:old[0]?.point.z,fresh:fresh[0]?.point.z});
    }
    for(const dz of [-.115,.115]){
      const hits=Hits(bolts,new THREE.Vector3(x,-.05,centerZ+dz),up,.10);
      Check(hits.some(h=>h.point.y<=-.020)&&hits.some(h=>h.point.y>=.026),'A real fastener connects the splice plate and wooden bearer',{supportIndex,x,dz});
    }
  }
}
for(const mesh of rayCache.values())mesh.geometry.dispose();rayMaterial.dispose();
console.log(`PASS BeishaheBridgeTest: ${checks} checks; ${triangles} triangles, ${parts.length} mesh primitives, ${g.materials.length} materials / ${imageStats.length} decoded images; ${size.toArray().map(v=>v.toFixed(3)).join(' x ')} m`);
