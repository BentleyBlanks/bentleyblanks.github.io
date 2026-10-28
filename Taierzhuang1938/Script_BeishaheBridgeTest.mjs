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
// weathered materials keep their Base/Normal/ORM maps; dark rail body and
// bridge steel deliberately share the same three steel texture images.
const materialSources={BeishaheSteel:'BeishaheSteel',BeishaheRailBody:'BeishaheSteel',BeishaheTimber:'BeishaheSleeper',BeishaheTimberEnd:'BeishaheSleeperEnd',BeishaheDeckTimber:'BeishaheDeckPlank',BeishaheStone:'BeishahePierStone',BeishaheStoneDamp:'BeishahePierDamp'};
const expectedMaterials=[...Object.keys(materialSources),'BeishaheRailRunning'];
Check(g.materials?.length===expectedMaterials.length&&expectedMaterials.every(name=>g.materials.some(m=>m.name===name)),'Seven weathered PBR materials and the single polished rail material exist');
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
  const orm=await CheckTexturePixels(m.name,'Orm',p.metallicRoughnessTexture.index,source,source==='BeishaheSteel'?[0,1,2]:[0,1]);
  await CheckTexturePixels(m.name,'Orm',m.occlusionTexture.index,source,[0]);
  if(source!=='BeishaheSteel')Check((p.metallicFactor??1)===0,'Wood and masonry do not become metallic after ORM repacking',m.name);
  baseImages.add(base.source);normalImages.add(normal.source);ormImages.add(orm.source);
  let sum=0,sum2=0;const pixels=normal.info.width*normal.info.height;
  for(let i=0;i<pixels;i++){const v=normal.data[i*3];sum+=v;sum2+=v*v;}
  const effectiveRms=Math.sqrt(Math.max(0,sum2/pixels-(sum/pixels)**2))*(m.normalTexture.scale??1);
  Check(effectiveRms>2,'Effective normal map relief remains visibly non-flat',{material:m.name,effectiveRms});
}
Check(baseImages.size===6&&normalImages.size===6&&ormImages.size===6,'Steel, sleepers, end grain, decking, dry and damp stone use distinct image data');
{
  const bridge=g.materials.find(m=>m.name==='BeishaheSteel'),rail=g.materials.find(m=>m.name==='BeishaheRailBody'),wear=g.materials.find(m=>m.name==='BeishaheRailRunning');
  const bp=bridge.pbrMetallicRoughness,rp=rail.pbrMetallicRoughness,rf=rp.baseColorFactor??[1,1,1,1];
  Check(rf.slice(0,3).every(v=>v>=.45&&v<=.65)&&Math.abs(rf[3]-1)<.001,'Rail body has a moderately darker, opaque physical base factor',rf);
  for(const [a,b] of [[bp.baseColorTexture,rp.baseColorTexture],[bridge.normalTexture,rail.normalTexture],[bp.metallicRoughnessTexture,rp.metallicRoughnessTexture],[bridge.occlusionTexture,rail.occlusionTexture]])
    Check(ImageForTexture(a.index).source===ImageForTexture(b.index).source,'Rail body reuses the original steel PBR images, without new textures');
  const im=ImageForTexture(rp.baseColorTexture.index),sum=[0,0,0],n=im.info.width*im.info.height;
  for(let i=0;i<n;i++)for(let c=0;c<3;c++){const x=im.data[i*3+c]/255;sum[c]+=x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}
  const body=(sum[0]*rf[0]*.2126+sum[1]*rf[1]*.7152+sum[2]*rf[2]*.0722)/n,wr=wear.pbrMetallicRoughness.baseColorFactor;
  const running=wr[0]*.2126+wr[1]*.7152+wr[2]*.0722;
  Check(running>body*1.5&&(wear.pbrMetallicRoughness.roughnessFactor??1)<=.4,'Polished running strip has a real physical reflectance contrast to the darker rail body',{body,running});
}

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
Check(spec.railNominalLengthM===10&&spec.railJointGapM===.006&&data.railJoints?.nominalRailLengthM===10&&data.railJoints.gapM===.006&&!data.railJoints.holesModeled,'Rail joint record distinguishes nominal historical spacing and unbored represented fasteners');
Check(/unverified design assumptions/i.test(data.railJoints.interpretation)&&/overlap solid undrilled/i.test(data.materialInterpretation?.railJoints??''),'Rail joints disclose unconfirmed locations and represented bolt/web overlap');
Check(spec.spikeEmbedDepthM===.12&&data.railFasteners?.spikeEmbedDepthM===spec.spikeEmbedDepthM&&!data.railFasteners.holesModeled&&!data.railFasteners.threadsModeled,'Spike record describes embedded smooth solids without claiming modeled holes or threads');
Check(data.railFasteners?.outsideCountPerRailSeat===2&&data.railFasteners.insideCountPerRailSeat===1&&data.railFasteners.flangeDiameterM===.044&&data.railFasteners.squareHeadWidthM===.019&&data.railFasteners.toolSquareEnvelopeM===.025,'The inferred three-spike layout, head proportions and assumed axial tool envelope are recorded');
Check(/authored interpretations/i.test(data.materialInterpretation?.railFasteners??'')&&/overlap undrilled sleeper and tie-plate/i.test(data.materialInterpretation.railFasteners),'Spike form and overlapping unbored solids remain explicit design assumptions');
const Role=p=>p.node.extras?.role;
const ByRole=(role,index)=>parts.filter(p=>Role(p)===role&&(index==null||p.node.extras?.spanIndex===index));
for(const part of parts){
  const name=g.materials[part.primitive.material]?.name,role=Role(part);
  if(name==='BeishaheRailRunning'||role==='RailWear')Check(name==='BeishaheRailRunning'&&role==='RailWear','Polished steel is restricted to dedicated rail-wear geometry',{name,role});
  const railBodyRoles=['RailWest','RailEast','RailMidSplice','RailJointSplice'];
  if(name==='BeishaheRailBody'||railBodyRoles.includes(role))Check(name==='BeishaheRailBody'&&railBodyRoles.includes(role),'Dark reused-steel material is restricted to actual rails and their fishplates',{name,role});
}
const pointCache=new Map();
function Points(part){if(pointCache.has(part))return pointCache.get(part);const out=[];for(let i=0;i<part.geo.positions.length;i+=3)out.push(new THREE.Vector3(part.geo.positions[i],part.geo.positions[i+1],part.geo.positions[i+2]).applyMatrix4(part.matrix));pointCache.set(part,out);return out;}
const triangleBoundsCache=new Map();
function TriangleBounds(part){
  if(triangleBoundsCache.has(part))return triangleBoundsCache.get(part);
  const points=Points(part),indices=part.geo.indices,n=indices?.length??points.length,bounds=new Float64Array(n*2);
  for(let i=0;i<n;i+=3){
    const a=points[indices?indices[i]:i],b=points[indices?indices[i+1]:i+1],c=points[indices?indices[i+2]:i+2],j=i*2;
    bounds[j]=Math.min(a.x,b.x,c.x);bounds[j+1]=Math.max(a.x,b.x,c.x);
    bounds[j+2]=Math.min(a.y,b.y,c.y);bounds[j+3]=Math.max(a.y,b.y,c.y);
    bounds[j+4]=Math.min(a.z,b.z,c.z);bounds[j+5]=Math.max(a.z,b.z,c.z);
  }
  triangleBoundsCache.set(part,bounds);return bounds;
}
function IntersectingTriangleBounds(part,min,max){
  const b=TriangleBounds(part);let count=0;
  for(let i=0;i<b.length;i+=6)if(b[i]<=max.x&&b[i+1]>=min.x&&b[i+2]<=max.y&&b[i+3]>=min.y&&b[i+4]<=max.z&&b[i+5]>=min.z)count++;
  return count;
}
function PartBounds(list){const box=new THREE.Box3();for(const p of list)box.union(p.bounds);return box;}
function SubBounds(points,predicate){const box=new THREE.Box3();for(const p of points)if(predicate(p))box.expandByPoint(p);return box;}
const rayMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),rayCache=new Map();
function RayMesh(part){if(rayCache.has(part))return rayCache.get(part);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(part.geo.positions,3));if(part.geo.color)geometry.setAttribute('color',new THREE.BufferAttribute(part.geo.color,part.geo.colorWidth));if(part.geo.indices)geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(part.geo.indices),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,rayMaterial);mesh.matrixAutoUpdate=false;mesh.matrix.copy(part.matrix);mesh.updateMatrixWorld(true);rayCache.set(part,mesh);return mesh;}
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
// Inspect the actual short faces, including both corners. Infer recessed joint
// locations by scanning the exported mesh rather than replaying the builder's
// row-width formula; consecutive courses must not share vertical through-joints.
// Every pier is probed through the inset core, including at bed joints.
function HitTint(hit){
  const mesh=hit.object,geometry=mesh.geometry,position=geometry.attributes.position,color=geometry.attributes.color,face=hit.face;
  if(!color||!face)return null;
  const a=new THREE.Vector3().fromBufferAttribute(position,face.a),b=new THREE.Vector3().fromBufferAttribute(position,face.b),c=new THREE.Vector3().fromBufferAttribute(position,face.c);
  const weights=THREE.Triangle.getBarycoord(mesh.worldToLocal(hit.point.clone()),a,b,c,new THREE.Vector3());
  if(!weights)return null;
  return [0,1,2].map(channel=>[face.a,face.b,face.c].reduce((sum,index,i)=>sum+color.array[index*color.itemSize+channel]*weights.getComponent(i),0));
}
for(let supportIndex=1;supportIndex<spec.spanCount;supportIndex++){
  const dry=ByRole('Pier').filter(p=>p.node.extras?.supportIndex===supportIndex),wet=ByRole('PierDamp').filter(p=>p.node.extras?.supportIndex===supportIndex),all=[...dry,...wet];
  const centerZ=-spec.lengthM/2+supportIndex*spec.spanPitchM,course=(spec.pierTopY-spec.foundationY-.25)/9;
  for(const faceSide of [-1,1]){
    const direction=new THREE.Vector3(-faceSide,0,0);
    for(let row=0;row<=9;row++){
      // Avoid the cap at the upper boundary; check all actual bed joints and
      // centers, including short-face end areas near the inset core's corners.
      if(row<9)for(const dz of [-.80,-.60,-.30,0,.30,.60,.80]){
        const y=spec.foundationY+(row+.5)*course,hits=Hits(dry,new THREE.Vector3(faceSide*3,y,centerZ+dz),direction,6);
        Check(hits.length>=2&&hits[hits.length-1].distance-hits[0].distance>3.65,'Short-face masonry retains solid backing from either direction',{supportIndex,row,faceSide,dz});
      }
      if(row>0&&row<9)for(const delta of [-.002,0,.002])for(const dz of [-.80,0,.80]){
        const y=spec.foundationY+row*course+delta,hits=Hits(dry,new THREE.Vector3(faceSide*3,y,centerZ+dz),direction,6);
        Check(hits.length>=2&&hits[hits.length-1].distance-hits[0].distance>3.65,'Inset core closes short-face bed joints and corner regions',{supportIndex,row,faceSide,dz,delta});
      }
    }
    // Three distinct template geometries are shared across 13 supports.
    if(supportIndex>3)continue;
    let previous=null;
    for(let row=0;row<9;row++){
      const y=spec.foundationY+(row+.5)*course,scan=[];
      for(let k=0;k<=280;k++){
        const dz=-.84+k*.006,hits=Hits(all,new THREE.Vector3(faceSide*3,y,centerZ+dz),direction,6);
        Check(hits.length>0,'Short-face scan hits actual masonry',{supportIndex,row,faceSide,dz});
        scan.push({dz,distance:hits[0].distance});
      }
      const surface=Math.min(...scan.map(s=>s.distance)),gaps=[];let group=[];
      function CloseGap(){if(group.length){gaps.push({z:group.reduce((a,s)=>a+s.dz,0)/group.length,min:group[0].dz,max:group[group.length-1].dz});group=[];}}
      for(const sample of scan){if(sample.distance>surface+.07)group.push(sample);else CloseGap();}CloseGap();
      Check(gaps.length>=2&&gaps.length<=4,'Actual short face has recessed joints across its width including near corners',{supportIndex,row,faceSide,gaps});
      if(previous)Check(gaps.every(g=>previous.every(p=>Math.abs(g.z-p.z)>.09)),'Consecutive short-face courses do not form aligned vertical seams',{supportIndex,row,faceSide,gaps,previous});
      previous=gaps;
      if(row<2){
        // Pick the centers of actual visible blocks from measured gap groups.
        const edges=[-.84,...gaps.map(g=>g.z),.84],colors=[];
        for(let j=0;j<edges.length-1;j++){
          const dz=(edges[j]+edges[j+1])/2,hits=Hits(wet,new THREE.Vector3(faceSide*3,y,centerZ+dz),direction,6);
          if(hits.length){const rgb=HitTint(hits[0]);if(rgb)colors.push(rgb);}
        }
        const luma=colors.map(c=>.2126*c[0]+.7152*c[1]+.0722*c[2]),range=luma.length?Math.max(...luma)-Math.min(...luma):0;
        Check(colors.length===edges.length-1&&range>.0085&&range<.16,'Same-height damp blocks retain controlled independent color, beyond the height gradient',{supportIndex,row,faceSide,range,colors:colors.length});
      }
    }
  }
}
Check(new Set(ByRole('Sleepers').map(p=>p.node.mesh)).size===3&&new Set(ByRole('DeckPlanks').map(p=>p.node.mesh)).size===3&&new Set(ByRole('Pier').map(p=>p.node.mesh)).size===3&&new Set(ByRole('PierDamp').map(p=>p.node.mesh)).size===3,'Three real geometry/UV variants break sleeper, deck and dry/damp pier repetition');
function UniqueUvCount(role){return new Set(ByRole(role).map(part=>Hash(Buffer.from(part.geo.uv.buffer,part.geo.uv.byteOffset,part.geo.uv.byteLength)))).size;}
Check(UniqueUvCount('Sleepers')===3&&UniqueUvCount('DeckPlanks')===3&&UniqueUvCount('Pier')===3&&UniqueUvCount('PierDamp')===3,'Three mesh variants contain genuinely different UV coordinates');
// Derive each UV direction from measured metre-space edges on the exported
// stone geometry. Quarter turns should break directional repetition without
// stretching the material or changing the authored one-metre texture scale.
for(const role of ['Pier','PierDamp']){
  const bins=[0,0,0,0];let scaleBad=0;
  for(const part of [...new Map(ByRole(role).map(p=>[p.node.mesh,p])).values()]){
    const {positions,indices,uv}=part.geo;
    for(let k=0;k<(indices?.length??positions.length/3);k+=3){
      const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j);
      for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){
        const dx=positions[3*b]-positions[3*a],dy=positions[3*b+1]-positions[3*a+1],dz=positions[3*b+2]-positions[3*a+2];
        if(dx<.05||Math.abs(dy)>.00001||Math.abs(dz)>.00001)continue;
        const du=uv[2*b]-uv[2*a],dv=uv[2*b+1]-uv[2*a+1];
        if(Math.abs(Math.hypot(du,dv)-dx)>.0002){scaleBad++;continue;}
        const bin=Math.abs(du)>Math.abs(dv)?(du>0?0:2):(dv>0?1:3);
        if(Math.min(Math.abs(du),Math.abs(dv))>.0002){scaleBad++;continue;}
        bins[bin]++;
      }
    }
  }
  Check(scaleBad===0&&bins.every(n=>n>=20),'Stone block UVs use all four quarter-turn directions at unchanged metre scale',{role,bins,scaleBad});
}
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
function PrepareBoardProfiles(rows,label){
  for(const [row,entry] of rows){
    const samples=[...new Map(entry.samples.map(s=>[Math.round(s.x*100000),s])).values()].sort((a,b)=>a.x-b.x);
    Check(samples.length>=6,'Each actual board has color samples across all three pieces',{label,row,count:samples.length});
    entry.rgb=samples[0].rgb;
    entry.colorAt=()=>entry.rgb;
    Check(samples.every(s=>s.rgb.every((v,c)=>Math.abs(v-entry.rgb[c])<.001)),
      'All three pieces of a physical board share its wood tint',{label,row});
  }
}
function CheckBoardEdgeProfiles(part,topFaces,rows,sideFaces,label,requireVariation){
  const {positions,color,colorWidth}=part.geo;
  const samples=new Map();
  for(const {ids,row,edge0,edge1} of topFaces){
    const entry=rows.get(row);if(!entry)continue;
    if(!samples.has(row))samples.set(row,{low:[],high:[]});
    for(const i of ids){
      const z=positions[i*3+2],ratio=color[i*colorWidth]/entry.colorAt(positions[i*3])[0];
      if(Math.abs(z-edge0)<.0005)samples.get(row).low.push(ratio);
      if(Math.abs(z-edge1)<.0005)samples.get(row).high.push(ratio);
    }
  }
  let invalidProfiles=0;const edgeTones=[],edgeWidths=[];
  for(const [row,entry] of rows){
    const a=samples.get(row),low=a?.low??[],high=a?.high??[];
    if(!low.length||!high.length){invalidProfiles++;continue;}
    entry.lowTone=low.reduce((s,v)=>s+v,0)/low.length;
    entry.highTone=high.reduce((s,v)=>s+v,0)/high.length;
    if(Math.max(...low)-Math.min(...low)>.01||Math.max(...high)-Math.min(...high)>.01||
       entry.lowTone<.54||entry.lowTone>.79||entry.highTone<.54||entry.highTone>.79||
       Math.abs(entry.lowTone-entry.highTone)>.04||
       entry.lowWidth<.0095||entry.lowWidth>.0185||entry.highWidth<.0095||entry.highWidth>.0185)invalidProfiles++;
    edgeTones.push(entry.lowTone,entry.highTone);edgeWidths.push(entry.lowWidth,entry.highWidth);
  }
  Check(invalidProfiles===0&&samples.size===rows.size,'Both real board edges have consistent moderate tones and physical transition widths',{label,invalidProfiles,rows:rows.size,sampled:samples.size});
  if(requireVariation){
    const mean=edgeTones.reduce((a,b)=>a+b,0)/edgeTones.length;
    Check(Math.max(...edgeTones)-Math.min(...edgeTones)>.12&&Math.max(...edgeWidths)-Math.min(...edgeWidths)>.004&&mean>.62,'Real edge shades and widths vary across rows and remain softer than the prior design',{label,mean});
  }
  let darkEdges=0,midEdges=0,centers=0,badGradient=0,discontinuities=0;const shared=new Map();
  for(const {ids,row,edge0,edge1} of topFaces){
    const entry=rows.get(row);if(!entry||entry.lowTone==null||entry.highTone==null){badGradient++;continue;}
    for(const i of ids){
      const z=positions[i*3+2],dl=z-edge0,dh=edge1-z,low=dl<=dh,distance=Math.max(0,Math.min(dl,dh));
      const width=low?entry.lowWidth:entry.highWidth,tone=low?entry.lowTone:entry.highTone,half=width*.5,mid=tone+.55*(1-tone);
      const expected=distance<half?tone+(mid-tone)*distance/half:distance<width?mid+(1-mid)*(distance-half)/(width-half):1;
      const base=entry.colorAt(positions[i*3]);
      for(let c=0;c<3;c++)if(Math.abs(color[i*colorWidth+c]/base[c]-expected)>.025)badGradient++;
      if(distance<.001)darkEdges++;else if(Math.abs(distance-half)<.001)midEdges++;else if(distance>=width-.001)centers++;
      const key=`${row}:${Math.round(positions[i*3]*10000)}:${Math.round(z*10000)}`,rgb=[0,1,2].map(c=>color[i*colorWidth+c]);
      if(shared.has(key)&&rgb.some((v,c)=>Math.abs(v-shared.get(key)[c])>.002))discontinuities++;else shared.set(key,rgb);
    }
  }
  Check(badGradient===0&&discontinuities===0&&darkEdges>=rows.size*6&&midEdges>=rows.size*6&&centers>=rows.size*6,'Actual coplanar board colors transition smoothly from each physical edge to its full center tint',{label,badGradient,discontinuities,darkEdges,midEdges,centers});
  if(sideFaces.length){
    Check(sideFaces.length>rows.size*3&&sideFaces.every(({row,rgb,x,z})=>{
      const r=rows.get(row);if(!r)return false;
      const tone=z<(r.edge0+r.edge1)/2?r.lowTone:r.highTone;
      const base=r.colorAt(x);
      return rgb.every((v,c)=>Math.abs(v/base[c]-.86*tone)<.025);
    }),'Physical side faces meet their corresponding darkened top edge without a color jump',{label,faces:sideFaces.length});
  }
}
const deckRowsByMesh=new Map(),deckWidthSignatures=[];
for(const part of [...new Map(ByRole('DeckPlanks').map(p=>[p.node.mesh,p])).values()]){
  const {positions,indices,uv,color,colorWidth}=part.geo;let edges=0,footIntrusions=0;
  Check(g.materials[part.primitive.material]?.name==='BeishaheDeckTimber','Deck boards use the separate authored deck PBR texture');
  Check(color&&colorWidth>=3,'Actual deck board mesh contains exported COLOR_0 tint');
  const railCenter=(spec.gaugeM+spec.railHeadWidthM)/2;
  const length=spec.spanPitchM-spec.expansionGapM,boardCount=Math.ceil(length/.225),rows=new Map(),sideFaces=[],topFaces=[];
  // Derive row boundaries from the exported triangles themselves. The top
  // bevel adds 3 mm on each side, in addition to the physical 6 mm seam.
  const intervals=[];
  for(let k=0;k<(indices?.length??positions.length/3);k+=3){
    const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j),xs=ids.map(i=>positions[i*3]);
    if(Math.max(...xs)-Math.min(...xs)>.15&&ids.every(i=>Math.abs(positions[i*3+1]-.075)<.0001)){
      const zs=ids.map(i=>positions[i*3+2]);intervals.push([Math.min(...zs),Math.max(...zs)]);
    }
  }
  intervals.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const extents=[];
  for(const [lo,hi] of intervals){
    const last=extents.at(-1);
    if(!last||lo>last.edge1+.0001)extents.push({edge0:lo,edge1:hi});
    else last.edge1=Math.max(last.edge1,hi);
  }
  Check(extents.length===boardCount,'Actual top triangles identify all transverse board rows',extents.length);
  const physicalWidths=extents.map(r=>r.edge1-r.edge0+.006);
  Check(physicalWidths.every((w,i)=>w>(length/boardCount)*.90-(i===0||i===boardCount-1?.003:.006)&&w<(length/boardCount)*1.10)&&
    Math.max(...physicalWidths)-Math.min(...physicalWidths)>.015&&new Set(physicalWidths.map(w=>Math.round(w*1000))).size>=16,
    'Real board widths show restrained variation across the span',{min:Math.min(...physicalWidths),max:Math.max(...physicalWidths)});
  Check(extents.length===boardCount&&Math.abs(extents[0].edge0-.003+length/2)<.0002&&Math.abs(extents.at(-1).edge1+.003-length/2)<.0002&&
    extents.slice(1).every((r,i)=>Math.abs(r.edge0-extents[i].edge1-.012)<.0002),
    'All actual top edges imply 6 mm physical gaps and close exactly at both span ends');
  deckRowsByMesh.set(part.node.mesh,extents);
  deckWidthSignatures.push(physicalWidths.map(w=>Math.round(w*10000)).join(','));
  for(let k=0;k<(indices?.length??positions.length/3);k+=3){
    const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j);
    const xs=ids.map(i=>positions[i*3]),xmin=Math.min(...xs),xmax=Math.max(...xs);
    for(const rail of [-railCenter,railCenter])if(xmin<rail+.0649&&xmax>rail-.0649)footIntrusions++;
    if(xmax-xmin>.15&&ids.every(i=>Math.abs(positions[i*3+1]-.075)<.0001)){
      const z=ids.reduce((sum,i)=>sum+positions[i*3+2],0)/3,row=extents.findIndex(r=>z>=r.edge0-.0001&&z<=r.edge1+.0001);
      const x=ids.reduce((sum,i)=>sum+positions[i*3],0)/3,zone=x<-.65?'left':x>.65?'right':'center';
      Check(row>=0,'Each top triangle belongs to a measured board row',z);
      if(row<0)continue;
      const {edge0,edge1}=extents[row];
      topFaces.push({ids,row,zone,edge0,edge1});
      const zValues=ids.map(i=>positions[i*3+2]);
      if(Math.max(...zValues)-Math.min(...zValues)>.08){
        const phase=[uv[ids[0]*2]-positions[ids[0]*3+2],uv[ids[0]*2+1]+positions[ids[0]*3]];
        const lowWidth=Math.min(...zValues)-edge0,highWidth=edge1-Math.max(...zValues);
        if(!rows.has(row))rows.set(row,{samples:[],phase,zones:new Set(),zoneExtents:new Map(),lowWidth,highWidth,edge0,edge1});
        const previous=rows.get(row);
        Check(phase.every((v,c)=>Math.abs(v-previous.phase[c])<.001)&&Math.abs(lowWidth-previous.lowWidth)<.001&&Math.abs(highWidth-previous.highWidth)<.001,'Three rail-separated pieces of one row share texture phase and edge widths',{row,zone});
        for(const i of ids)previous.samples.push({x:positions[i*3],rgb:[0,1,2].map(c=>color[i*colorWidth+c])});
        previous.zones.add(zone);
      }
    }
    const ys=ids.map(i=>positions[i*3+1]),zs=ids.map(i=>positions[i*3+2]);
    if(xmax-xmin>.15&&Math.max(...ys)-Math.min(...ys)>.02&&Math.max(...zs)-Math.min(...zs)<.0001){
      const z=zs.reduce((a,b)=>a+b,0)/3,row=extents.findIndex(r=>Math.abs(z-(r.edge0-.003))<.0002||Math.abs(z-(r.edge1+.003))<.0002);
      sideFaces.push({row,z,x:positions[ids[0]*3],rgb:[color[ids[0]*colorWidth],color[ids[0]*colorWidth+1],color[ids[0]*colorWidth+2]]});
    }
    for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){
      const dx=Math.abs(positions[a*3]-positions[b*3]),dz=Math.abs(positions[a*3+2]-positions[b*3+2]);
      if(dx<.15||dz>.0001||Math.abs(positions[a*3+1]-.075)>.0001||Math.abs(positions[b*3+1]-.075)>.0001)continue;
      const du=Math.abs(uv[a*2]-uv[b*2]),dv=Math.abs(uv[a*2+1]-uv[b*2+1]);
      Check(du<.001&&Math.abs(dv-dx)<.001,'Deck top-face grain follows each transverse plank X axis',{du,dv,dx});edges++;
    }
  }
  Check(footIntrusions===0,'No physical deck triangle intrudes into either steel rail foot',footIntrusions);
  Check(edges>=20,'Each deck variant has enough real grain-aligned transverse plank tops',edges);
  for(const {ids,row,zone} of topFaces){
    const entry=rows.get(row);if(!entry)continue;
    const zs=ids.map(i=>positions[i*3+2]),range=entry.zoneExtents.get(zone)??[Infinity,-Infinity];
    range[0]=Math.min(range[0],...zs);range[1]=Math.max(range[1],...zs);entry.zoneExtents.set(zone,range);
  }
  Check(rows.size===boardCount&&[...rows.values()].every(r=>r.zones.size===3),'Every transverse row contains all three visible pieces',rows.size);
  Check([...rows.values()].every(r=>r.zoneExtents.size===3&&[...r.zoneExtents.values()].every(([lo,hi])=>Math.abs(lo-r.edge0)<.0002&&Math.abs(hi-r.edge1)<.0002)),
    'Each actual row has identical outer boundaries across its three rail-separated pieces');
  PrepareBoardProfiles(rows,'span deck');
  const tones=[...rows.values()].map(r=>r.rgb),values=tones.map(rgb=>(rgb[0]+rgb[1]+rgb[2])/3);
  Check(new Set(tones.map(rgb=>rgb.map(x=>Math.round(x*10000)).join(','))).size>boardCount*.8&&Math.max(...values)-Math.min(...values)>.12&&Math.max(...values)-Math.min(...values)<.38&&tones.every(rgb=>rgb[0]>=rgb[2]&&rgb.every(v=>v>=.48&&v<=1.001)),'Different rows show visible but restrained deterministic warm-gray timber variation');
  CheckBoardEdgeProfiles(part,topFaces,rows,sideFaces,'span deck',true);
}
Check(new Set(deckWidthSignatures).size===3,'All three exported deck templates have different real board width sequences');
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
// Outside guard timbers are a labelled design inference, not evidence of the
// 1938 bridge. Probe the exported geometry, fixings and crossings themselves.
Check(/not evidence for Beishahe/i.test(data.guardTimbers?.interpretation??''),'Guard dimensions remain an authored interpretation');
const guardDown=new THREE.Vector3(0,-1,0),guardUp=new THREE.Vector3(0,1,0);
for(let i=0;i<spec.spanCount;i++){
  const length=spec.spanPitchM-spec.expansionGapM,center=-spec.lengthM/2+spec.spanPitchM*(i+.5),tieCount=Math.ceil(length/spec.sleeperSpacingM);
  const guards=ByRole('GuardTimbers',i),fixings=ByRole('GuardFasteners',i),deck=ByRole('DeckPlanks',i),bearers=ByRole('DeckBearers',i),ties=ByRole('Sleepers',i);
  Check(guards.length===1&&fixings.length===1,'Every span contains both outside guard timbers and their fixings',i+1);
  for(const side of [-1,1]){
    const x=side*1.25;
    for(let k=0;k<tieCount;k++){
      const z=center-length/2+(k+.5)*length/tieCount,origin=new THREE.Vector3(x,.20,z);
      const wood=Hits(guards,origin,guardDown,.20),bolt=Hits(fixings,origin,guardDown,.39),tie=Hits(ties,origin,guardDown,.39),bearer=Hits(bearers,origin,guardDown,.39);
      // Small samples can land on a real 6 mm plank joint; require support
      // at two out of three nearby positions on each side of the bolt.
      const support=direction=>[.012,.024,.036].filter(d=>Hits(deck,new THREE.Vector3(x,.20,z+direction*d),guardDown,.20).length>0).length;
      const left=support(-1),right=support(1);
      Check(wood.length>=2&&Math.abs(wood[0].point.y-.135)<.001&&Math.abs(wood[wood.length-1].point.y-.075)<.001,'Guard has a real top and a bottom resting on the deck',{span:i+1,side,k});
      Check(bolt.length>=2&&bolt[0].point.y<=spec.railHeightM+.0001&&bolt[bolt.length-1].point.y<=-.16,'Actual fixing reaches below sleeper and stays under rail running height',{span:i+1,side,k});
      Check(tie.length>=2&&bearer.length>=2&&left>=2&&right>=2,'Actual fixing crosses a sleeper and bearer with deck support on both sides',{span:i+1,side,k,tie:tie.length,bearer:bearer.length,left,right});
    }
    for(let k=1;k<5;k++){
      const z=center-length/2+k*length/5;
      Check(Hits(guards,new THREE.Vector3(x,.20,z),guardDown,.20).length===0&&Hits(guards,new THREE.Vector3(x,.20,z-.008),guardDown,.20).length>0&&Hits(guards,new THREE.Vector3(x,.20,z+.008),guardDown,.20).length>0,'Guard timber pieces have real separated ends on both sides',{span:i+1,side,k});
    }
    const inner=side*(1.25-.07),outer=side*(1.25+.07),railOutside=side*((spec.gaugeM+spec.railHeadWidthM)/2+.065);
    Check(Math.abs(inner)-Math.abs(railOutside)>.30&&Math.abs(outer)<spec.sleeperLengthM/2,'Guard remains outside rail hardware and within sleeper width',{span:i+1,side});
  }
}
for(let i=1;i<spec.spanCount;i++){
  const z=-spec.lengthM/2+i*spec.spanPitchM,role=name=>parts.filter(p=>Role(p)===name&&p.node.extras?.supportIndex===i);
  const guard=role('GuardJoint'),plates=role('GuardJointSplice'),bolts=role('GuardJointBolts'),deck=role('DeckJoint');
  Check(guard.length===1&&plates.length===1&&bolts.length===1,'Each pier has physical guard insert, side plates and bolts',i);
  for(const side of [-1,1]){
    const x=side*1.25,hit=Hits(guard,new THREE.Vector3(x,.20,z),guardDown,.20),wood=Hits(deck,new THREE.Vector3(x,.20,z),guardDown,.20);
    Check(hit.length>=2&&wood.length>=2&&Math.abs(hit[hit.length-1].point.y-wood[0].point.y)<.001,'Guard insert bears on the actual wooden deck',{pier:i,side});
    for(const dz of [-.13,0,.13]){
      const bolt=Hits(bolts,new THREE.Vector3(x-0.12,.105,z+dz),new THREE.Vector3(1,0,0),.24);
      const span=Hits(dz===0?guard:ByRole('GuardTimbers',dz<0?i-1:i),new THREE.Vector3(x-0.12,.105,z+dz),new THREE.Vector3(1,0,0),.24);
      const plate=Hits(plates,new THREE.Vector3(x-0.12,.105,z+dz),new THREE.Vector3(1,0,0),.24);
      Check(bolt.length>=2&&span.length>=2&&plate.length>=2,'Real bolts pass through both splice plates and wood on each side of the joint',{pier:i,side,dz});
    }
  }
}
function CheckRailJoint(centerZ,rails,wear,splice,fasteners,label){
  const railCenter=(spec.gaugeM+spec.railHeadWidthM)/2,halfGap=spec.railJointGapM/2;
  Check(rails.length>=2&&wear.length>=1&&splice.length===1&&fasteners.length===1,'Actual rail joint and hardware meshes exist',label);
  const plateBounds=PartBounds(splice);
  Check(Math.abs(plateBounds.min.z-(centerZ-.18))<.001&&Math.abs(plateBounds.max.z-(centerZ+.18))<.001,'Both physical splice plates straddle the rail joint',label);
  const hardwarePoints=[...Points(splice[0]),...Points(fasteners[0])];
  Check(hardwarePoints.every(p=>Math.min(Math.abs(p.x-railCenter),Math.abs(p.x+railCenter))<.065&&p.y>=.047&&p.y<.100),'Joint hardware stays within the open rail-foot channels and below the rail head',label);
  for(const side of [-1,1]){
    const x=side*railCenter,up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
    for(const dz of [-.004,0,.004]){
      const railHit=Hits(rails,new THREE.Vector3(x,.20,centerZ+dz),down,.22),wearHit=Hits(wear,new THREE.Vector3(x,.20,centerZ+dz),down,.22);
      Check(dz===0?railHit.length===0&&wearHit.length===0:railHit.some(h=>Math.abs(h.point.y-.14)<.0002)&&wearHit.some(h=>Math.abs(h.point.y-.1408)<.0002),'Rail and running surfaces have an actual open gap and matching heights on both sides',{label,side,dz});
    }
    for(const direction of [-1,1]){
      const cap=Hits(rails,new THREE.Vector3(x,.12,centerZ),new THREE.Vector3(0,0,direction),.02);
      Check(cap.length>0&&Math.abs(cap[0].distance-halfGap)<.0002,'Both actual rail end faces bound the six-millimetre joint',{label,side,direction,distance:cap[0]?.distance});
    }
    for(const dz of [-.13,-.055,.055,.13])for(const face of [-1,1]){
      const z=centerZ+dz,y=.072,inside=new THREE.Vector3(x,y,z),outward=new THREE.Vector3(face,0,0);
      const rail=Hits(rails,inside,outward,.05),plate=Hits(splice,inside,outward,.05);
      Check(rail.length>0&&plate.length>0&&Math.abs(rail[0].distance-plate[0].distance)<.001,'Real fishplate inner surface contacts the appropriate rail web',{label,side,face,dz});
      const origin=new THREE.Vector3(x+face*.05,y,z),inward=new THREE.Vector3(-face,0,0),head=Hits(fasteners,origin,inward,.05),outer=Hits(splice,origin,inward,.05);
      Check(head.length>0&&outer.length>0&&face*(head[0].point.x-outer[0].point.x)>.0058&&face*(head[0].point.x-outer[0].point.x)<.0062,'Four represented bolt heads or nuts touch each splice plate',{label,side,face,dz});
    }
    // Sample the represented shaft through the web. This is deliberately an
    // overlapping visual model; the rail and plates are not drilled meshes.
    const shaft=Hits(fasteners,new THREE.Vector3(x-.05,.072,centerZ-.13),new THREE.Vector3(1,0,0),.10);
    Check(shaft.length>=4,'Represented through-bolt shaft and heads exist across both plates',label);
    rayMaterial.side=THREE.FrontSide;
    for(const face of [-1,1]){
      const origin=new THREE.Vector3(x+face*.05,.072,centerZ-.13),direction=new THREE.Vector3(-face,0,0);
      Check(Hits(splice,origin,direction,.05).length>0&&Hits(fasteners,origin,direction,.05).length>0,'Fishplates and bolt heads remain outward-visible with backface culling',{label,side,face});
    }
    rayMaterial.side=THREE.DoubleSide;
  }
}
let bearingCount=0;const coverageGaps=[];
for(let i=0;i<spec.spanCount;i++){
  const center=-spec.lengthM/2+spec.spanPitchM*(i+.5),length=spec.spanPitchM-spec.expansionGapM;
  const trusses=ByRole('Trusses',i),sleepers=ByRole('Sleepers',i),ends=ByRole('SleeperEnds',i),planks=ByRole('DeckPlanks',i),bearers=ByRole('DeckBearers',i),west=ByRole('RailWest',i),east=ByRole('RailEast',i),wear=ByRole('RailWear',i),bearings=ByRole('Bearings',i),midSplice=ByRole('RailMidSplice',i),midFasteners=ByRole('RailMidFasteners',i);
  Check(trusses.length===1&&sleepers.length===1&&ends.length===1&&planks.length===1&&bearers.length===1&&west.length===1&&east.length===1&&wear.length===1&&bearings.length===1&&midSplice.length===1&&midFasteners.length===1,'Span has independent truss, decking, rails, midspan joint hardware and bearings',i+1);
  Check(data.assemblies[i].spanIndex===i&&Math.abs(data.assemblies[i].centerZ-center)<.0001&&data.assemblies[i].bearings.length===4,'Sidecar span location and four bearing inventory agree with metric layout',i+1);
  const w=Points(west[0]),e=Points(east[0]);
  const railCenter=(spec.gaugeM+spec.railHeadWidthM)/2;
  const wHead=SubBounds(w,p=>p.y>spec.railHeightM-.035),eHead=SubBounds(e,p=>p.y>spec.railHeightM-.035);
  Check(Math.abs(eHead.min.x-wHead.max.x-spec.gaugeM)<.0001,'Gauge is measured between the actual inner rail-head faces',i+1);
  for(const box of [wHead,eHead])Check(Math.abs(box.max.z-box.min.z-(spec.spanPitchM-spec.railJointGapM))<.001&&Math.abs(box.max.x-box.min.x-spec.railHeadWidthM)<.001,'Rail heads reach the support joints with the correct section width',i+1);
  const sb=PartBounds(sleepers);Check(Math.abs(sb.max.y)<.0001&&Math.abs(sb.max.x-sb.min.x-spec.sleeperLengthM)<.001,'Sleeper top is the zero-height datum and retains physical width',i+1);
  const deckBounds=PartBounds(planks),bearerBounds=PartBounds(bearers);
  Check(Math.abs(deckBounds.min.y-.03)<.0001&&Math.abs(deckBounds.max.y-.075)<.0001&&Math.abs(deckBounds.max.x-deckBounds.min.x-spec.sleeperLengthM)<.001&&Math.abs(deckBounds.max.z-deckBounds.min.z-length)<.001,'Actual wooden deck covers the full 2.8 m bridge width, resting above sleeper-top bearers',i+1);
  Check(Math.abs(bearerBounds.min.y)<.001&&Math.abs(bearerBounds.max.y-.03)<.001,'Physical longitudinal bearers stand on sleepers and support transverse planks',i+1);
  Check(g.materials[planks[0].primitive.material]?.name==='BeishaheDeckTimber'&&g.materials[bearers[0].primitive.material]?.name==='BeishaheDeckTimber','Deck and supporting bearers use the authored deck material',i+1);
  const deckRivets=ByRole('Rivets',i),tieCount=Math.ceil(length/spec.sleeperSpacingM);
  const tieZ=k=>center-length/2+(k+.5)*length/tieCount;
  const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
  // Measure actual embedded shafts, flange and contact on representative
  // ties in every span. Modeled solids intentionally overlap where a drilled
  // hole would be; the metal threads and holes are not claimed as geometry.
  for(const railSide of [-1,1])for(const footSide of [-1,1]){
    const outside=footSide===railSide,offsets=outside?[-.055,.055]:[0];
    for(const dz of offsets)for(const k of [0,Math.floor(tieCount/2)-1,Math.floor(tieCount/2),tieCount-1]){
      const rail=railSide*railCenter,x=rail+footSide*.085,z=tieZ(k)+dz,origin=new THREE.Vector3(x,.09,z);
      const shaft=Hits(deckRivets,origin,down,.22),tie=Hits(sleepers,origin,down,.26),plate=Hits(trusses,origin,down,.10);
      Check(shaft.length>=2&&tie.length>=2&&shaft.some(h=>Math.abs(h.point.y+spec.spikeEmbedDepthM)<.0005)&&tie.some(h=>Math.abs(h.point.y)<.0002)&&tie.some(h=>Math.abs(h.point.y+spec.sleeperDepthM)<.0002),'Each represented shaft enters its actual sleeper by 120 mm',{span:i+1,railSide,footSide,dz,k,shaftY:shaft.map(h=>h.point.y),tieY:tie.map(h=>h.point.y)});
      const headTop=outside?.061:.05823;
      Check(plate.some(h=>Math.abs(h.point.y-.010)<.0002)&&shaft.some(h=>Math.abs(h.point.y-headTop)<.0002),'Screw shaft crosses its tie plate and reaches its square head',{span:i+1,railSide,footSide,dz,k});
      const flangeY=(outside?.028:.02523)+.0055;
      for(const dir of [-1,1]){
        const edge=Hits(deckRivets,new THREE.Vector3(x,flangeY,z),new THREE.Vector3(dir,0,0),.03);
        Check(edge.length>0&&Math.abs(edge[0].distance-.022)<.0002,'Real circular flange has 44 mm diameter',{span:i+1,railSide,footSide,dz,k,dir,distance:edge[0]?.distance});
      }
      const rel=outside?.060:.064,cx=rail+footSide*rel,base=new THREE.Vector3(cx,.09,z),fastener=Hits(deckRivets,base,down,.09),railHit=Hits(railSide<0?west:east,base,down,.09);
      Check(fastener.length>=2&&railHit.length>0&&Math.abs(fastener[fastener.length-1].point.y-railHit[0].point.y)<.00025,'Outer hook plate or inner flange reaches the real rail foot',{span:i+1,railSide,footSide,dz,k,fastenerY:fastener.map(h=>h.point.y),railY:railHit.map(h=>h.point.y)});
      rayMaterial.side=THREE.FrontSide;
      const visibleHead=Hits(deckRivets,origin,down,.09),visibleContact=Hits(deckRivets,base,down,.09);
      Check(visibleHead.some(h=>Math.abs(h.point.y-headTop)<.0002)&&visibleContact.length>0,'Square head and rail-foot contact are outward visible with backface culling',{span:i+1,railSide,footSide,dz,k});
      rayMaterial.side=THREE.DoubleSide;
    }
  }
  for(const side of [-1,1])for(const k of [tieCount/2-1,tieCount/2]){
    const x=side*railCenter,z=tieZ(k),tie=Hits(sleepers,new THREE.Vector3(x,-.10,z),up,.12),plate=Hits(trusses,new THREE.Vector3(x,-.01,z),up,.04),rail=Hits(side<0?west:east,new THREE.Vector3(x,.20,z),down,.22);
    Check(tie.some(h=>Math.abs(h.point.y)<.0002)&&plate.some(h=>Math.abs(h.point.y-.010)<.0002)&&rail.some(h=>Math.abs(h.point.y-.010)<.0002),'Both sleepers and tie plates support the suspended midspan joint without overlap',{span:i+1,side,k});
  }
  CheckRailJoint(center,[...west,...east],wear,midSplice,midFasteners,`span ${i+1} midpoint`);
  // Sample every span: the steel rail occupies its foot area; all remaining
  // walking regions must be wood, with only small physical joints allowed.
  let covered=0,samples=0,innerCovered=0,innerSamples=0,outerCovered=0,outerSamples=0;const misses=[];
  for(let zi=0;zi<12;zi++)for(let xi=0;xi<19;xi++){
    const z=center-length/2+(zi+.37)*length/12,x=-1.35+xi*.15;
    const hit=Hits([...planks,...west,...east],new THREE.Vector3(x,.25,z),down,.27).length>0;
    covered+=Number(hit);samples++;
    if(!hit)misses.push({x,z});
    if(Math.abs(x)<=.6){innerCovered+=Number(hit);innerSamples++;}
    if(Math.abs(x)>=.9){outerCovered+=Number(hit);outerSamples++;}
  }
  const gaps=[];
  for(const {x,z} of misses){
    const woodAt=(zz)=>Hits(planks,new THREE.Vector3(x,.25,zz),down,.27).length>0;
    const edge=[];
    for(const sign of [-1,1]){
      let hitDistance=0;
      for(let d=.0005;d<=.03001;d+=.0005)if(woodAt(z+sign*d)){hitDistance=d;break;}
      Check(hitDistance>0,'Every uncovered sample has nearby real wood on both sides',{span:i+1,x,z,sign});
      let emptyDistance=0,solidDistance=hitDistance;
      for(let n=0;n<14;n++){
        const mid=(emptyDistance+solidDistance)/2;
        if(woodAt(z+sign*mid))solidDistance=mid;else emptyDistance=mid;
      }
      edge.push(z+sign*solidDistance);
    }
    const width=edge[1]-edge[0];
    Check(width>0&&width<=.0061&&woodAt(edge[0]-.0001)&&woodAt(edge[1]+.0001),'Every uncovered sample lies in a real at-most 6.1 mm joint with wood on both sides',{span:i+1,x,z,width,edge});
    gaps.push(width);
  }
  coverageGaps.push(...gaps);
  const measuredRows=deckRowsByMesh.get(planks[0].node.mesh);
  Check(measuredRows?.length>20,'Span has measured deck rows for physical seam ray tests',i+1);
  const seamZ=center+(measuredRows[19].edge1+measuredRows[20].edge0)/2;
  const seam=Hits(planks,new THREE.Vector3(.4,.20,seamZ),down,.21);
  const before=Hits(planks,new THREE.Vector3(.4,.20,seamZ-.008),down,.21);
  const after=Hits(planks,new THREE.Vector3(.4,.20,seamZ+.008),down,.21);
  const innerBefore=Hits(planks,new THREE.Vector3(.4,.20,seamZ-.0025),down,.21),innerAfter=Hits(planks,new THREE.Vector3(.4,.20,seamZ+.0025),down,.21);
  Check(seam.length===0&&innerBefore.length===0&&innerAfter.length===0&&before.length>0&&after.length>0,'Deck has a genuine 6 mm transverse joint with wood on both sides',{span:i+1,z:seamZ});
  // Rail feet remain free of wood. Physical local cutouts expose each square
  // screw head while the back strip still joins its neighbouring boards.
  for(const rail of [-railCenter,railCenter]){
    Check(Hits(planks,new THREE.Vector3(rail,.20,center),down,.21).length===0,'Deck does not occupy the steel rail-foot channel',{span:i+1,rail});
    for(const sign of [-1,1]){
      const outside=sign*rail>0,offsets=outside?[-.055,.055]:[0],headTop=outside?.061:.05823;
      for(const k of [2,Math.floor(tieCount/2),tieCount-3])for(const dz of offsets){
        const z=tieZ(k)+dz,x=rail+sign*.085,origin=new THREE.Vector3(x,.20,z);
        const spike=Hits(deckRivets,origin,down,.20),all=Hits([...planks,...deckRivets,...west,...east],origin,down,.20);
        Check(spike.length>0&&all.length>0&&Math.abs(spike[0].point.y-headTop)<.0003&&Math.abs(all[0].distance-spike[0].distance)<.0003,'Each screw head is the first visible surface through its actual local opening',{span:i+1,rail,sign,k,dz,spike:spike[0]?.point.y,first:all[0]?.point.y});
        for(const dx of [-.0085,.0085])for(const dzCorner of [-.0085,.0085]){
          const p=new THREE.Vector3(x+dx,.20,z+dzCorner),head=Hits(deckRivets,p,down,.20),woodAtHead=Hits(planks,p,down,.20);
          Check(head.some(h=>Math.abs(h.point.y-headTop)<.0003)&&woodAtHead.length===0,'All four corners of each square head fit the physical wood opening',{span:i+1,rail,sign,k,dz,dx,dzCorner});
        }
        // A 25 mm square, vertical tool envelope is a test fixture, not a
        // historical tool claim. Nine sampled lines must remain free of wood
        // down to Y=.040 around every represented screw on these ties.
        for(const dx of [-.0125,0,.0125])for(const dzTool of [-.0125,0,.0125]){
          const woodInTool=Hits(planks,new THREE.Vector3(x+dx,.20,z+dzTool),down,.16);
          Check(woodInTool.length===0,'Local opening clears a 25 mm square axial tool envelope',{span:i+1,rail,sign,k,dz,dx,dzTool,woodY:woodInTool.map(h=>h.point.y)});
        }
        const toolMin=new THREE.Vector3(x-.0125,.040,z-.0125),toolMax=new THREE.Vector3(x+.0125,.080,z+.0125);
        const woodCandidates=planks.reduce((sum,part)=>sum+IntersectingTriangleBounds(part,toolMin,toolMax),0);
        Check(woodCandidates===0,'No actual deck triangle bounding box intersects the full 25 mm axial tool prism',{span:i+1,rail,sign,k,dz,woodCandidates});
        const wood=Hits(planks,new THREE.Vector3(rail+sign*.105,.20,z),down,.20);
        Check(wood.length>0&&Math.abs(wood[0].point.y-.075)<.001,'Actual back strip remains solid beside each screw head',{span:i+1,rail,sign,k,dz});
      }
      if(!outside)for(const k of [2,Math.floor(tieCount/2),tieCount-3])for(const dz of [-.055,.055]){
        const absent=Hits(deckRivets,new THREE.Vector3(rail+sign*.085,.09,tieZ(k)+dz),down,.09);
        Check(absent.length===0,'No extra outer-pattern screws appear on the single-spike inside of this rail seat',{span:i+1,rail,sign,k,dz});
      }
      const z=tieZ(Math.floor(tieCount/2))+offsets[0];
      const xInside=rail+sign*.098,xOutside=rail+sign*.100;
      Check(Hits(planks,new THREE.Vector3(xInside,.20,z),down,.20).length===0&&Hits(planks,new THREE.Vector3(xOutside,.20,z),down,.20).length>0,'Square-head opening has a narrow lateral clearance and adjacent wood',{span:i+1,rail,sign});
      const x=rail+sign*.085,zInside=z+.0135,zOutside=z+.0145;
      Check(Hits(planks,new THREE.Vector3(x,.20,zInside),down,.20).length===0&&Hits(planks,new THREE.Vector3(x,.20,zOutside),down,.20).length>0,'Square-head opening has a narrow lengthwise clearance and adjacent wood',{span:i+1,rail,sign});
      const backX=rail+sign*.102,tie=tieZ(Math.floor(tieCount/2));
      for(const along of [-1,1]){
        const joins=Hits(planks,new THREE.Vector3(backX,.055,tie),new THREE.Vector3(0,0,along),.12);
        Check(joins.filter(hit=>Math.abs(hit.distance-.1005)<.001).length>=2,'Narrow backing strip physically butts against its neighbouring supported boards',{span:i+1,rail,sign,along,distances:joins.slice(0,3).map(h=>h.distance)});
        const bearingX=rail+sign*.112,bearingZ=tie+along*.105,bearingOrigin=new THREE.Vector3(bearingX,.08,bearingZ);
        const endWood=Hits(planks,bearingOrigin,down,.08),endBearer=Hits(bearers,bearingOrigin,down,.08);
        Check(endWood.length>=2&&endBearer.length>=2&&Math.abs(endWood[endWood.length-1].point.y-.03)<.0003&&Math.abs(endBearer[0].point.y-.03)<.0003,'Backing strip joins a deck portion that bears directly on its longitudinal support at both ends',{span:i+1,rail,sign,along,wood:endWood.map(h=>h.point.y),bearer:endBearer.map(h=>h.point.y)});
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
    Check(!strip.isEmpty()&&Math.abs(strip.max.x-strip.min.x-.044)<.001&&Math.abs(strip.max.z-strip.min.z-(spec.spanPitchM-spec.railJointGapM))<.001&&Math.abs(strip.min.y-spec.railHeightM)<.001,'Wheel-contact strips reach the actual support joints',{span:i+1,side});
  }
  rayMaterial.side=THREE.FrontSide;
  const nearDeckRow=deckRowsByMesh.get(planks[0].node.mesh).reduce((best,row)=>Math.abs((row.edge0+row.edge1)/2-.05)<Math.abs((best.edge0+best.edge1)/2-.05)?row:best);
  const deckZ=center+(nearDeckRow.edge0+nearDeckRow.edge1)/2,deckTop=Hits(planks,new THREE.Vector3(0,.20,deckZ),down,.21),deckUnder=Hits(planks,new THREE.Vector3(0,.02,deckZ),up,.10);
  Check(deckTop.length>0&&deckUnder.length>0&&Math.abs(deckTop[0].point.y-.075)<.001&&Math.abs(deckUnder[0].point.y-.03)<.001,'Deck has visible outward-facing top and underside, not a one-sided collision sheet',i+1);
  const firstSleeperZ=center-length/2+length/(2*Math.ceil(length/spec.sleeperSpacingM));
  for(const side of [-1,1]){
    Check(Hits(ends,new THREE.Vector3(side*(spec.sleeperLengthM/2+.2),-.08,firstSleeperZ),new THREE.Vector3(-side,0,0),.5).length>0,'End-grain face remains outward-visible with backface culling',{span:i+1,side});
    const nodeZ=center-length/2+length*2/spec.panelsPerSpan;
    Check(Hits(trusses,new THREE.Vector3(side*(spec.trussCenterOffsetM+.7),spec.trussTopY,nodeZ),new THREE.Vector3(-side,0,0),1.2).length>0,'Node plate is visible from the exterior with backface culling',{span:i+1,side});
    Check(Hits(trusses,new THREE.Vector3(0,spec.trussTopY,nodeZ),new THREE.Vector3(side,0,0),3).length>0,'Node plate is visible from inside the bridge with backface culling',{span:i+1,side});
    Check(Hits(wear,new THREE.Vector3(side*railCenter,.5,center+.01),new THREE.Vector3(0,-1,0),1).length>0,'Polished rail top remains visible with backface culling beside the actual joint',{span:i+1,side});
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
// Capstones are a visual construction inference, not established history.
// Inspect the exported faces rather than accepting the sidecar description:
// the 52 interior bearing feet must sit on stone across their footprints,
// real open joints must separate the capstones, and a solid base must close
// each joint beneath the visible depth and connect to the pier core.
Check(data.pierCap?.stoneCount===4&&/unconfirmed/i.test(data.pierCap?.interpretation??''),'Pier cap detail remains an authored design');
for(let supportIndex=1;supportIndex<spec.spanCount;supportIndex++){
  const centerZ=-spec.lengthM/2+supportIndex*spec.spanPitchM;
  const caps=ByRole('Cap').filter(p=>p.node.extras?.supportIndex===supportIndex);
  const dry=ByRole('Pier').filter(p=>p.node.extras?.supportIndex===supportIndex);
  const down=new THREE.Vector3(0,-1,0),top=spec.pierTopY;
  Check(caps.length===1&&dry.length===1,'Interior support has an actual cap and pier core',supportIndex);
  for(const side of [-1,1])for(const direction of [-1,1]){
    const spanIndex=direction<0?supportIndex-1:supportIndex;
    const feet=ByRole('Bearings',spanIndex),bearingZ=centerZ+direction*.26,bearingX=side*spec.trussCenterOffsetM;
    for(const dx of [-.24,0,.24])for(const dz of [-.29,0,.29]){
      const origin=new THREE.Vector3(bearingX+dx,top+.20,bearingZ+dz);
      const shoe=Hits(feet,origin,down,.40),cap=Hits(caps,origin,down,.40);
      Check(shoe.some(h=>Math.abs(h.point.y-top)<.0005)&&cap.some(h=>Math.abs(h.point.y-top)<.0005),
        'The actual bearing foot and cap touch over their sampled footprint',{supportIndex,side,direction,dx,dz});
    }
  }
  for(const seamX of [-1.1375,0,1.1375])for(const dz of [-.9,0,.9]){
    const z=centerZ+dz,origin=new THREE.Vector3(seamX,top+.05,z);
    const seam=Hits(caps,origin,down,.32);
    const left=Hits(caps,new THREE.Vector3(seamX-.03,top+.05,z),down,.32);
    const right=Hits(caps,new THREE.Vector3(seamX+.03,top+.05,z),down,.32);
    Check(seam.length>=2&&Math.abs(seam[0].point.y-(top-.225))<.001&&Math.abs(seam[seam.length-1].point.y-(top-.25))<.001,
      'A real recessed cap joint is closed below by solid base material',{supportIndex,seamX,dz,heights:seam.map(h=>h.point.y)});
    Check(left.some(h=>Math.abs(h.point.y-top)<.001)&&right.some(h=>Math.abs(h.point.y-top)<.001),
      'Solid capstone tops flank each physical joint',{supportIndex,seamX,dz});
    for(const direction of [-1,1]){
      const edge=Hits(caps,new THREE.Vector3(seamX,top-.10,z),new THREE.Vector3(direction,0,0),.05);
      Check(edge.length>0&&Math.abs(edge[0].distance-.007)<.001,'Capstone joint has two real separated vertical faces',{supportIndex,seamX,dz,direction,distance:edge[0]?.distance});
    }
    if(dz===0){
      const capBase=Hits(caps,new THREE.Vector3(seamX,top-.20,z),down,.10),core=Hits(dry,new THREE.Vector3(seamX,top-.20,z),down,.30);
      Check(capBase.some(h=>Math.abs(h.point.y-(top-.25))<.001)&&core.some(h=>Math.abs(h.point.y-(top-.25))<.001),
        'Cap base meets the actual pier core beneath each seam',{supportIndex,seamX,dz});
    }
  }
}
// Truss members still stop at each structural expansion joint. Separate real
// rail ends, wooden deck and bolted support bridge the structural gap; there
// is a single rail joint rather than an unphysical 116 mm rail insert.
const transitionRoles=['RailJointSplice','RailJointFasteners','DeckJoint','DeckJointSupport','DeckJointSplice','DeckJointBolts'];
for(const role of transitionRoles)Check(ByRole(role).length===spec.spanCount-1,'A real transition mesh exists at each intermediate pier',role);
Check(data.transitions?.length===spec.spanCount-1&&Math.abs(data.deck?.jointEndClearanceM-.002)<1e-9,'All 13 metric deck/track transitions are recorded');
Check(/not established by a confirmed 1938 Beishahe bridge photograph/i.test(data.materialInterpretation?.jointTransitions??''),'Pier transition details remain explicitly authored construction');
for(let supportIndex=1;supportIndex<spec.spanCount;supportIndex++){
  const centerZ=-spec.lengthM/2+supportIndex*spec.spanPitchM;
  const one=role=>ByRole(role).filter(p=>p.node.extras?.supportIndex===supportIndex);
  const railSplice=one('RailJointSplice'),railFasteners=one('RailJointFasteners'),deck=one('DeckJoint'),support=one('DeckJointSupport'),splice=one('DeckJointSplice'),bolts=one('DeckJointBolts');
  const railWest=[...ByRole('RailWest',supportIndex-1),...ByRole('RailWest',supportIndex)],railEast=[...ByRole('RailEast',supportIndex-1),...ByRole('RailEast',supportIndex)],railWear=[...ByRole('RailWear',supportIndex-1),...ByRole('RailWear',supportIndex)];
  Check([railSplice,railFasteners,deck,support,splice,bolts].every(p=>p.length===1)&&railWest.length===2&&railEast.length===2&&railWear.length===2,'Pier joins two actual span rails and exactly one mesh per hardware role',supportIndex);
  const info=data.transitions.find(t=>t.supportIndex===supportIndex);
  Check(info&&Math.abs(info.centerZ-centerZ)<.0001&&Math.abs(info.structuralGapM-.12)<.0001&&Math.abs(info.deckEndClearanceM-.002)<.0001&&Math.abs(info.railJointGapM-.006)<.0001,'Transition record distinguishes structural, deck and rail gaps',supportIndex);
  const priorTruss=PartBounds(ByRole('Trusses',supportIndex-1)),nextTruss=PartBounds(ByRole('Trusses',supportIndex));
  Check(Math.abs((nextTruss.min.z-priorTruss.max.z)-spec.expansionGapM)<.001,'Actual steel trusses retain their 120 mm expansion gap without overlapping',{supportIndex,prior:priorTruss.max.z,next:nextTruss.min.z});
  const priorDeck=PartBounds(ByRole('DeckPlanks',supportIndex-1)),jointDeck=PartBounds(deck),nextDeck=PartBounds(ByRole('DeckPlanks',supportIndex));
  Check(Math.abs(jointDeck.min.z-priorDeck.max.z-.002)<.0005&&Math.abs(nextDeck.min.z-jointDeck.max.z-.002)<.0005,'Deck insert retains both real two-millimetre clearances',supportIndex);
  CheckRailJoint(centerZ,[...railWest,...railEast],railWear,railSplice,railFasteners,`pier ${supportIndex}`);
  const railCenter=(spec.gaugeM+spec.railHeadWidthM)/2,spanLength=spec.spanPitchM-spec.expansionGapM,tieCount=Math.ceil(spanLength/spec.sleeperSpacingM);
  for(const direction of [-1,1])for(const side of [-1,1]){
    const spanIndex=direction<0?supportIndex-1:supportIndex,z=centerZ+direction*(spec.expansionGapM/2+spanLength/(2*tieCount)),x=side*railCenter;
    const ties=ByRole('Sleepers',spanIndex),trusses=ByRole('Trusses',spanIndex),rails=ByRole(side<0?'RailWest':'RailEast',spanIndex),up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
    const tie=Hits(ties,new THREE.Vector3(x,-.10,z),up,.12),plate=Hits(trusses,new THREE.Vector3(x,-.01,z),up,.04),rail=Hits(rails,new THREE.Vector3(x,.20,z),down,.22);
    Check(tie.some(h=>Math.abs(h.point.y)<.0002)&&plate.some(h=>Math.abs(h.point.y-.010)<.0002)&&rail.some(h=>Math.abs(h.point.y-.010)<.0002),'Both adjacent sleepers and plates bear the rail joint without overlap',{supportIndex,side,direction,z});
  }
  const deckBox=PartBounds(deck),supportBox=PartBounds(support),spliceBox=PartBounds(splice),boltBox=PartBounds(bolts);
  Check(Math.abs(deckBox.max.x-deckBox.min.x-spec.sleeperLengthM)<.001&&Math.abs(deckBox.min.y-.03)<.001&&Math.abs(deckBox.max.y-.075)<.001,'Joint deck retains full width and matching physical top/bottom elevations',supportIndex);
  Check(Math.abs(supportBox.min.z-(centerZ-.06))<.001&&Math.abs(supportBox.max.z-(centerZ+.06))<.001&&Math.abs(supportBox.min.y)<.001&&Math.abs(supportBox.max.y-.03)<.001,'Wooden joint supports occupy exactly the truss gap',supportIndex);
  Check(Math.abs(spliceBox.min.z-(centerZ-.18))<.001&&Math.abs(spliceBox.max.z-(centerZ+.18))<.001&&Math.abs(spliceBox.max.y)<.001,'Steel plates overlap and support both neighbouring wooden bearer ends',supportIndex);
  Check(boltBox.min.y<=-.020&&boltBox.max.y>=.026,'Bolts extend through the splice plates into the wooden bearers',supportIndex);
  Check(g.materials[deck[0].primitive.material]?.name==='BeishaheDeckTimber'&&g.materials[support[0].primitive.material]?.name==='BeishaheDeckTimber'&&g.materials[splice[0].primitive.material]?.name==='BeishaheSteel','Physical wood and steel support roles use their correct materials',supportIndex);
  {
    const {positions,indices,uv,color,colorWidth}=deck[0].geo,railCenter=(spec.gaugeM+spec.railHeadWidthM)/2;
    let intrusions=0,edges=0;const jointRows=new Map(),jointTop=[];
    Check(color&&colorWidth>=3,'Joint deck retains real wood tint data',supportIndex);
    for(let k=0;k<(indices?.length??positions.length/3);k+=3){
      const ids=[0,1,2].map(j=>indices?indices[k+j]:k+j),xs=ids.map(i=>positions[i*3]),xmin=Math.min(...xs),xmax=Math.max(...xs);
      for(const rail of [-railCenter,railCenter])if(xmin<rail+.0649&&xmax>rail-.0649)intrusions++;
      if(xmax-xmin>.15&&ids.every(i=>Math.abs(positions[i*3+1]-.075)<.0001)){
        const edge0=-.055,edge1=.055,row=0;
        jointTop.push({ids,row,edge0,edge1});
        const zValues=ids.map(i=>positions[i*3+2]);
        if(Math.max(...zValues)-Math.min(...zValues)>.05){
          const lowWidth=Math.min(...zValues)-edge0,highWidth=edge1-Math.max(...zValues);
          const phase=[uv[ids[0]*2]-positions[ids[0]*3+2],uv[ids[0]*2+1]+positions[ids[0]*3]];
          if(!jointRows.has(row))jointRows.set(row,{samples:[],phase,lowWidth,highWidth,edge0,edge1});
          const entry=jointRows.get(row);
          Check(phase.every((v,c)=>Math.abs(v-entry.phase[c])<.001)&&Math.abs(lowWidth-entry.lowWidth)<.0001&&Math.abs(highWidth-entry.highWidth)<.0001,'Joint board phase and edge widths remain consistent across its three pieces',supportIndex);
          for(const i of ids)entry.samples.push({x:positions[i*3],rgb:[0,1,2].map(c=>color[i*colorWidth+c])});
        }
      }
      for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){
        const dx=Math.abs(positions[a*3]-positions[b*3]),dz=Math.abs(positions[a*3+2]-positions[b*3+2]);
        if(dx<.15||dz>.0001||Math.abs(positions[a*3+1]-.075)>.0001||Math.abs(positions[b*3+1]-.075)>.0001)continue;
        const du=Math.abs(uv[a*2]-uv[b*2]),dv=Math.abs(uv[a*2+1]-uv[b*2+1]);
        Check(du<.001&&Math.abs(dv-dx)<.001,'Joint board texture grain remains transverse across the pier',{supportIndex,du,dv,dx});edges++;
      }
    }
    Check(intrusions===0&&edges>=3,'Joint wood avoids both rail-foot channels and contains real transverse board surfaces',{supportIndex,intrusions,edges});
    Check(jointRows.size===1,'Joint deck has one coherent board profile',supportIndex);
    PrepareBoardProfiles(jointRows,'joint deck');
    CheckBoardEdgeProfiles(deck[0],jointTop,jointRows,[],'joint deck',false);
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
console.log(`PASS BeishaheBridgeTest: ${checks} checks; ${triangles} triangles, ${parts.length} mesh primitives, ${g.materials.length} materials / ${imageStats.length} decoded images; ${size.toArray().map(v=>v.toFixed(3)).join(' x ')} m; ${coverageGaps.length} uncovered samples bounded by joints ${coverageGaps.length?Math.min(...coverageGaps).toFixed(6):'n/a'}–${coverageGaps.length?Math.max(...coverageGaps).toFixed(6):'n/a'} m`);
