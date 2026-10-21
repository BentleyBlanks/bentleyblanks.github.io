// Independent final <=40000-triangle V13 GLB/PBR audit.
// node <this.mjs> raw.glb --bake=Data_Lod40kPbrBakeV13.json
//   --geometry=Data_Lod40kGeometryV13.json --out=report.json
// Geometry is checked against the separate actual reduced-geometry inventory.
// PNG samples retain their stored 8/16-bit precision; WebP is fully decoded.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {loadSharp,readGlb,viewBytes} from '../_import/Script_SichuanQualityPackageV12.mjs';

const folder=fileURLToPath(new URL('../../tmp/SichuanBlanketPack/Lod40kV13/',import.meta.url)),args=process.argv.slice(2);
const option=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
if(args.includes('--help')){console.log('node Script_SichuanLodVerifyV13.mjs raw.glb --bake=Data_Lod40kPbrBakeV13.json --geometry=Data_Lod40kGeometryV13.json --out=report.json');process.exit(0);}
const model=path.resolve(args.find(a=>!a.startsWith('--'))??path.join(folder,'PbrFinal/Model_SichuanLod40kPbrV13.glb'));
const bakeFile=path.resolve(option('bake')??path.join(path.dirname(model),'Data_Lod40kPbrBakeV13.json'));
const geometryFile=path.resolve(option('geometry')??path.join(folder,'Data_Lod40kGeometryV13.json'));
const output=path.resolve(option('out')??path.join(folder,'Data_Lod40kGlbValidationV13.json'));
const parts=['Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'],triangleLimit=40000,resolution=4096;
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const report={generator:'SichuanLod40kValidationV13',model,bakeFile,geometryFile,triangleBudget:triangleLimit,checks:[],parts:{},images:[],objects:[],limitations:[
  'Structural hide/withdrawal proof is mathematical; browser controls and rendered fidelity require visual review.',
  'Reduced geometry is checked against the independent V13 object/part inventory and a 40000-triangle all-parts ceiling; it is not required to equal the high master.',
  'Source hashes establish before/after provenance; no binary vertex identity across glTF splitting or geometric fidelity from triangle counts alone is claimed.',
  'No pixel-per-triangle, 3000-triangle, or legacy one-atlas gate is used.'
]};
const hash=data=>createHash('sha256').update(data).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const near=(a,b,epsilon=1e-6)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=epsilon);
function check(ok,label,detail){report.checks.push({ok:!!ok,label,...(detail===undefined?{}:{detail})});if(!ok)console.error('FAIL',label,detail??'');return !!ok;}
function require(ok,label,detail){if(!check(ok,label,detail))throw Error(label);}
function mul(a,b){const r=Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
function matrix(n){
  if(n.matrix)return n.matrix;
  const [x,y,z,w]=n.rotation??[0,0,0,1],[a,b,c]=n.scale??[1,1,1],[tx,ty,tz]=n.translation??[0,0,0];
  return [(1-2*y*y-2*z*z)*a,(2*x*y+2*w*z)*a,(2*x*z-2*w*y)*a,0,(2*x*y-2*w*z)*b,(1-2*x*x-2*z*z)*b,(2*y*z+2*w*x)*b,0,(2*x*z+2*w*y)*c,(2*y*z-2*w*x)*c,(1-2*x*x-2*y*y)*c,0,tx,ty,tz,1];
}
function transform(m,x,y,z){return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
function bounds(){return {min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};}
function include(box,p){for(let i=0;i<3;i++){box.min[i]=Math.min(box.min[i],p[i]);box.max[i]=Math.max(box.max[i],p[i]);}}
function finish(box){return {...box,size:box.max.map((v,i)=>v-box.min[i]),center:box.max.map((v,i)=>(v+box.min[i])/2)};}
function evidence(entry,label){
  require(entry&&typeof entry.path==='string'&&fs.existsSync(entry.path),`${label} exists`,entry?.path);
  const data=fs.readFileSync(entry.path),actual={bytes:data.length,sha256:hash(data)};
  require(actual.bytes===entry.bytes&&actual.sha256===entry.sha256,`${label} bytes and SHA-256 match`,actual);return data;
}
function fingerprintValid(value){return value&&Number.isInteger(value.vertices)&&value.vertices>0&&Number.isInteger(value.triangles)&&value.triangles>0&&
  typeof value.geometryAndUvSha256==='string'&&typeof value.cornerNormalSha256==='string'&&
  typeof value.activeAtlasUv==='string'&&typeof value.uvLayerHashes?.[value.activeAtlasUv]==='string';}
function sameFingerprint(a,b){const keys=['vertices','triangles','geometryAndUvSha256','cornerNormalSha256','activeAtlasUv','uvLayerHashes'];return a&&b&&keys.every(key=>same(a[key],b[key]));}
function sameSourceEvidence(a,b){return a&&b&&a.bytes===b.bytes&&a.sha256===b.sha256;}
async function decodedRgba8(data,label){
  sharpRuntime??=loadSharp();sharpRuntime.sharp.cache({memory:32});report.sharpModule=sharpRuntime.resolved;
  const decoded=await sharpRuntime.sharp(data).ensureAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
  require(decoded.info.width===resolution&&decoded.info.height===resolution&&decoded.info.channels===4&&decoded.data.length===resolution*resolution*4,
    `${label} actual full RGBA8 decode has the expected dimensions and row layout`);return decoded.data;
}
function highAtlasRoles(g){
  const result=new Map(),seen=new Set();
  function add(info,part,channel){
    require(info&&(info.texCoord??0)===0&&!info.extensions?.KHR_texture_transform,'Fallback high source samples its actual direct atlas UV');
    const texture=g.textures?.[info.index],id=texture?.source??texture?.extensions?.EXT_texture_webp?.source,key=part+':'+channel;
    require(Number.isInteger(id)&&(!result.has(key)||result.get(key)===id),'Fallback high atlas identity is unambiguous',key);result.set(key,id);
  }
  function walk(id,owner){require(!seen.has(id),'Fallback high reference scene is not cyclic');seen.add(id);const node=g.nodes[id];if(parts.includes(node.name))owner=node.name;
    if(node.mesh!==undefined){require(parts.includes(owner),'Fallback high reference geometry has actual part ownership');for(const primitive of g.meshes[node.mesh].primitives){const material=g.materials[primitive.material],pbr=material.pbrMetallicRoughness;add(pbr.baseColorTexture,owner,'Base');add(material.normalTexture,owner,'Normal');add(pbr.metallicRoughnessTexture,owner,'Orm');}}
    for(const child of node.children??[])walk(child,owner);
  }
  for(const root of g.scenes[g.scene??0].nodes)walk(root,null);require(result.size===15,'Fallback high runtime contains all fifteen actual source atlas roles');return result;
}
function nearestSurfaceFallbackEvidence(projection,bake){
  if(!projection?.nearestSurfaceFallback)return null;
  const record=projection.nearestSurfaceFallback,value=JSON.parse(evidence(record,'Actual nearest-surface transfer report').toString('utf8').replace(/^\uFEFF/,''));
  require(value.generator==='SichuanNearestSurfaceFallbackV13'&&value.imagesEncoded===true&&value.pixelPaintingUsed===false&&near(value.resolutionPerPart??[],[resolution,resolution],0),
    'Nearest-surface transfer is an actual complete encoded 4K mathematical surface bake');
  require(sameSourceEvidence(value.sourceHighRuntime,bake.sourceHighRuntime)&&sameSourceEvidence(value.sourceHighBlend,bake.sourceBlend),
    'Nearest-surface transfer uses the same frozen actual high/native inputs');
  const primary=JSON.parse(evidence(value.sourceProjection,'Original immutable ray-projection report').toString('utf8').replace(/^\uFEFF/,''));
  require(primary.generator==='SichuanLodProjectionBakeV13'&&primary.partialProbe===false&&primary.selectedToActive===true&&primary.rayProjectionUsed===true&&near(primary.resolutionPerPart??[],[resolution,resolution],0),
    'Nearest-surface output retains its actual complete primary ray-bake provenance');
  const inputs=JSON.parse(evidence(value.sourceImageInputs,'Actual source-atlas/RGBA8 input manifest').toString('utf8').replace(/^\uFEFF/,''));
  require(inputs.generator==='SichuanFallbackImageInputsV13'&&inputs.resolution===resolution&&sameSourceEvidence(inputs.projection,value.sourceProjection)&&sameSourceEvidence(inputs.sourceHighRuntime,bake.sourceHighRuntime),
    'Fallback image inputs are bound to the original ray report and frozen high runtime');
  const baseline=new Map(projection.objects.map(row=>[row.kind+':'+row.part+':'+row.originalName,row])),seen=new Set(),lowParts=new Set();
  require(Array.isArray(primary.objects)&&primary.objects.length===projection.objects.length,'Fallback final projection retains the original actual high/low inventory');
  for(const row of primary.objects){const key=row.kind+':'+row.part+':'+row.originalName,final=baseline.get(key);require(final&&sameFingerprint(row.before,final.before)&&sameFingerprint(row.after,final.after),'Final fallback projection retains every primary mesh/UV/corner-normal baseline',key);}
  require(Array.isArray(value.objects)&&value.objects.length>0,'Fallback contains actual high/low mesh and UV state evidence');
  for(const row of value.objects){
    const key=row.kind+':'+row.part+':'+row.originalName,original=baseline.get(key);
    require(!seen.has(key)&&original&&fingerprintValid(row.before)&&same(row.before,row.after)&&sameFingerprint(row.before,original.before)&&sameFingerprint(row.after,original.after),
      'Fallback retains the actual source/destination mesh, UV and corner-normal baseline',key);seen.add(key);if(row.kind==='Low')lowParts.add(row.part);
  }
  const states=new Map();
  for(const [part,row]of Object.entries(value.parts??{})){
    require(parts.includes(part)&&lowParts.has(part)&&Number.isInteger(row.correctedUvCoveredRayMissPixels)&&row.correctedUvCoveredRayMissPixels>=0,
      'Fallback part/count belongs to an actual unchanged low component',part);
    require(value.objects.some(object=>object.kind==='High'&&object.part===part),'Fallback part has actual high reference meshes',part);
    const maskBytes=evidence(row.correctedTexels,part+' complete corrected-texel mask');
    require(row.correctedTexels.encoding==='uint32-le, PNG top-row-first flat pixel index'&&maskBytes.length%4===0&&maskBytes.length/4===row.correctedUvCoveredRayMissPixels,
      'Fallback complete sparse mask has the actual declared encoding/count',part);
    const indices=[],mask=new Set();let previous=-1;
    for(let offset=0;offset<maskBytes.length;offset+=4){const index=maskBytes.readUInt32LE(offset);require(index>previous&&index<resolution*resolution,'Fallback sparse mask is unique, sorted and within actual image bounds',part);indices.push(index);mask.add(index);previous=index;}
    for(const channel of ['Base','Normal','Orm']){
      require(sameSourceEvidence(row.beforeImages?.[channel],primary.atlases?.[part]?.images?.[channel]),'Fallback before image is the original actual ray-baked PNG',part+' '+channel);
      const output=row.outputs?.[channel];require(output&&sameSourceEvidence(output,projection.atlases?.[part]?.images?.[channel])&&output.rgbaRoundtripExact===true&&typeof output.decodedRgba8Sha256==='string',
        'Final projection atlas uses the actual encoded closest-surface output',part+' '+channel);
    }
    require(Number.isFinite(row.maximumNearestSurfaceDistanceM)&&row.maximumNearestSurfaceDistanceM>=0,'Fallback records an actual finite high-surface distance',part);
    states.set(part,{row,indices,mask,coverageHits:new Set(),before:null,verifiedChannels:[],channelEvidence:{}});
  }
  require(states.size>0&&states.size===lowParts.size,'Every fallback low component has a complete actual mask/output record');
  for(const part of parts)if(!states.has(part))for(const channel of ['Base','Normal','Orm'])require(sameSourceEvidence(primary.atlases?.[part]?.images?.[channel],projection.atlases?.[part]?.images?.[channel]),'Unprocessed projection channels remain the original actual primary output',part+' '+channel);
  const high=readGlb(bake.sourceHighRuntime.path),roles=highAtlasRoles(high.document);
  report.nearestSurfaceFallback={...record,parts:{},sourceProjection:value.sourceProjection,sourceImageInputs:value.sourceImageInputs,
    actualPrimaryRayProjectionRetained:true,geometryUvAndCornerNormalsUnchanged:true,
    declaredTransferPolicies:Object.fromEntries(Object.entries(value).filter(([key])=>/Policy|Bound|Distance|Determinant/.test(key))),
    limitations:['This verifier validates actual atlas input bytes, complete correction masks and image differences; it does not independently repeat the source BVH/Mikk nearest-surface calculation.',
      'Source triangles with invalid atlas centroids may be excluded and a sample may move within its real triangle to valid atlas coverage; inspect the recorded source barycentrics and distances.']};
  return {value,primary,inputs,states,high,roles};
}
async function fallbackPartBefore(fallback,part){
  const state=fallback.states.get(part);if(state.before)return state.before;
  state.before={};
  for(const channel of ['Base','Normal','Orm']){
    const entry=state.row.beforeImages[channel],data=evidence(entry,part+' '+channel+' actual before-fallback PNG'),pixels=await decodedRgba8(data,part+' '+channel+' before-fallback');
    const input=fallback.inputs.parts?.[part]?.low?.[channel];
    require(input&&input.sourceImageSha256===entry.sha256&&input.width===resolution&&input.height===resolution&&input.channels===4&&input.rowOrder==='PNG top row first'&&input.encoding===(channel==='Base'?'sRGB8':'linear8'),
      'Fallback low input manifest records actual original PNG/colour/row semantics',part+' '+channel);
    const raw=evidence(input,part+' '+channel+' actual low RGBA8 input');require(raw.equals(pixels),'Fallback low RGBA8 cache equals the independently decoded original PNG',part+' '+channel);state.before[channel]=pixels;
  }
  for(const index of state.indices){
    const at=index*4,b=state.before.Base,o=state.before.Orm,n=state.before.Normal;
    require(b[at]+b[at+1]+b[at+2]===0||o[at]+o[at+1]+o[at+2]===0||b[at+3]===0||o[at+3]===0||n[at+3]===0,
      'Fallback modifies only an actual originally black or transparent ray-miss texel',{part,index});
  }
  return state.before;
}
async function verifyFallbackImage(fallback,part,channel,data){
  const state=fallback?.states.get(part);if(!state)return null;
  const before=(await fallbackPartBefore(fallback,part))[channel],after=await decodedRgba8(data,part+' '+channel+' final closest-surface');
  const output=state.row.outputs[channel];require(hash(after)===output.decodedRgba8Sha256,'Actual final PNG retains every mathematically baked RGBA8 output byte',part+' '+channel);
  const input=fallback.inputs.parts?.[part]?.high?.[channel],id=fallback.roles.get(part+':'+channel),sourceImage=fallback.high.document.images[id],encoded=viewBytes(fallback.high,sourceImage.bufferView);
  require(input&&input.sourceImageSha256===hash(encoded)&&input.width===resolution&&input.height===resolution&&input.channels===4&&input.rowOrder==='PNG top row first'&&input.encoding===(channel==='Base'?'sRGB8':'linear8'),
    'Fallback actual high atlas bytes and declared colour/row semantics match the retained runtime',part+' '+channel);
  const sourcePixels=await decodedRgba8(encoded,part+' '+channel+' frozen high atlas'),sourceRaw=evidence(input,part+' '+channel+' actual high RGBA8 input');
  require(sourceRaw.equals(sourcePixels),'Fallback high RGBA8 input equals independent actual runtime-image decode',part+' '+channel);
  const outsideBefore=createHash('sha256'),outsideAfter=createHash('sha256');let start=0,changedMaskPixels=0,maxNormalLengthError=0;
  for(const index of state.indices){const at=index*4;outsideBefore.update(before.subarray(start,at));outsideAfter.update(after.subarray(start,at));start=at+4;
    if(!before.subarray(at,at+4).equals(after.subarray(at,at+4)))changedMaskPixels++;
    require(after[at+3]>0&&after[at]+after[at+1]+after[at+2]>0,'Fallback corrected texel contains written nonblack actual output',{part,channel,index});
    if(channel==='Normal'){const nx=after[at]/255*2-1,ny=after[at+1]/255*2-1,nz=after[at+2]/255*2-1;maxNormalLengthError=Math.max(maxNormalLengthError,Math.abs(Math.hypot(nx,ny,nz)-1));}
  }
  outsideBefore.update(before.subarray(start));outsideAfter.update(after.subarray(start));const oldHash=outsideBefore.digest('hex'),newHash=outsideAfter.digest('hex');
  require(oldHash===newHash,'Every RGBA8 byte outside the actual correction mask is unchanged',part+' '+channel);
  if(channel==='Normal')require(maxNormalLengthError<=.02,'Every transferred normal in the correction mask remains a valid quantised unit tangent normal',{part,maxNormalLengthError});
  const result={correctedMaskPixels:state.indices.length,changedMaskPixels,outsideMaskRgba8Sha256:oldHash,unchangedOutsideMask:true,
    sourceImageSha256:hash(encoded),sourceDecodedRgba8Sha256:hash(sourcePixels),...(channel==='Normal'?{maximumCorrectedNormalLengthError:maxNormalLengthError}:{})};
  state.channelEvidence[channel]=result;state.verifiedChannels.push(channel);return result;
}
function projectionBakeEvidence(bake,geometry,expectedObjects){
  if(bake.materialBakeMode!=='projected-high-to-low-new-uv'){
    require(bake.materialBakeMode===undefined||bake.materialBakeMode==='retained-high-atlas-world-normal-transfer','Material provenance mode is a supported explicit V13 route',bake.materialBakeMode);
    require(!bake.projectionBake,'Legacy retained-atlas mode does not attach an unvalidated projection claim');
    return null;
  }
  const bytes=evidence(bake.projectionBake,'Independent actual high-to-low ProjectionBake report');
  const value=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  require(value.generator==='SichuanLodProjectionBakeV13','Projection provenance identifies the actual separate projection exporter');
  require(value.partialProbe===false&&near(value.resolutionPerPart??[],[resolution,resolution],0)&&
    Array.isArray(value.partSubset)&&value.partSubset.length===parts.length&&parts.every(part=>value.partSubset.includes(part)),
    'Projection is a complete actual five-part 4096 bake');
  require(value.materialBakeMode==='projected-high-to-low-new-uv'&&value.uvReunwrapPerformed===true&&
    value.originalHighAtlasBytesClaimedInherited===false&&bake.originalHighAtlasBytesClaimedInherited===false,
    'Projection honestly declares new low UV and rebaked Base/Normal/ORM rather than high-atlas byte inheritance');
  require(value.selectedToActive===true&&value.rayProjectionUsed===true&&value.pixelPaintingUsed===false&&
    Number.isInteger(value.samples)&&value.samples>0&&value.normalSpace==='TANGENT',
    'Projection records real selected-high-to-low sampling and a low tangent-space normal bake');
  require(sameSourceEvidence(value.sourceHighRuntime,bake.sourceHighRuntime)&&sameSourceEvidence(value.sourceHighBlend,bake.sourceBlend),
    'Independent projection and final export use the same immutable actual high runtime/native source');
  require(value.highGeometryUvAndMaterialsUnchanged===true,'Projection retained the actual high source geometry, UV and materials');
  const low=new Map(),high=new Map();
  require(Array.isArray(value.objects)&&value.objects.length>0,'Projection contains independently recorded high and low object states');
  for(const row of value.objects){
    require(['High','Low'].includes(row.kind)&&parts.includes(row.part)&&typeof row.originalName==='string','Projection source identities and roles are explicit');
    const key=row.originalName,target=row.kind==='Low'?low:high;
    require(!target.has(key)&&fingerprintValid(row.before)&&same(row.before,row.after),`${row.kind} ${key} is unchanged around the actual projection bake on its own UV/basis`);
    if(row.kind==='Low'){
      const expected=expectedObjects.get(key),before=row.beforeReunwrap,after=row.afterReunwrap;
      require(expected&&expected.part===row.part&&expected.triangles===row.before.triangles&&
        same(expected.sourceGeometryAndUvs,row.before)&&same(expected.sourceGeometryAndUvsAfterBake,row.after),
        `${key} final export uses exactly the new-UV projection baseline`);
      require(fingerprintValid(before)&&fingerprintValid(after)&&typeof before.geometryOnlySha256==='string'&&
        before.geometryOnlySha256===after.geometryOnlySha256&&before.vertices===after.vertices&&before.triangles===after.triangles&&
        before.cornerNormalSha256===after.cornerNormalSha256&&sameFingerprint(after,row.before),
        `${key} re-unwrapping preserves positions/topology/material indices/corner normals before the new bake baseline`);
      require(after.uvLayerHashes[after.activeAtlasUv]!==before.uvLayerHashes[before.activeAtlasUv],
        `${key} has an actual newly unwrapped atlas rather than relabelled inherited UV`);
    }
    target.set(key,row);
  }
  require(low.size===expectedObjects.size&&high.size>0,'Projection accounts for every actual low export object and its real high references');
  for(const part of parts){
    require([...high.values()].some(row=>row.part===part),'Each rebaked component has actual high projection sources',part);
    require([...low.values()].filter(row=>row.part===part).reduce((n,row)=>n+row.before.triangles,0)===geometry.partTriangles[part],
      'Projection part counts agree with the independent reduced inventory',part);
  }
  report.materialBakeMode=bake.materialBakeMode;report.projectionBake={...bake.projectionBake,objects:low.size,highObjects:high.size,
    newUvBaselineUnchangedDuringBake:true,oldHighAtlasBytesClaimedInherited:false};
  return value;
}
function pixelFacts(width,height,depth,channels,readPixel){
  const min=Array(4).fill(Infinity),max=Array(4).fill(-Infinity),sum=Array(4).fill(0),coveredMin=Array(3).fill(Infinity),coveredMax=Array(3).fill(-Infinity),limit=depth===16?65535:255;
  let covered=0,nonBlackCovered=0;
  for(let index=0;index<width*height;index++){
    const values=readPixel(index);for(let c=0;c<4;c++){min[c]=Math.min(min[c],values[c]);max[c]=Math.max(max[c],values[c]);sum[c]+=values[c];}
    if(values[3]>0){covered++;if(values[0]+values[1]+values[2]>0)nonBlackCovered++;for(let c=0;c<3;c++){coveredMin[c]=Math.min(coveredMin[c],values[c]);coveredMax[c]=Math.max(coveredMax[c],values[c]);}}
  }
  return {width,height,bitDepth:depth,channels,pixels:width*height,alphaMarkedPixels:covered,nonBlackAlphaMarkedPixels:nonBlackCovered,
    minimum:min.map(v=>v/limit),maximum:max.map(v=>v/limit),mean:sum.map(v=>v/(limit*width*height)),
    alphaMarkedRgbRange:[coveredMin.map(v=>v/limit),coveredMax.map(v=>v/limit)],alphaSynthesisedOpaque:channels===3};
}
function withPixelAccess(facts,pixels){
  const bytes=facts.bitDepth/8,limit=facts.bitDepth===16?65535:255,channels=facts.channels,values=[0,0,0,limit];
  Object.defineProperty(facts,'readPixel',{enumerable:false,value:index=>{
    for(let channel=0;channel<channels;channel++){const at=(index*channels+channel)*bytes;values[channel]=bytes===1?pixels[at]:pixels[at]*256+pixels[at+1];}
    return values;
  }});return facts;
}
function projectionCoverage(triangles,facts,channel,fallbackState=null){
  const width=facts.width,height=facts.height,limit=facts.bitDepth===16?65535:255;
  let sampleVisits=0,zeroAlphaSamples=0,blackSamples=0,trianglesWithSamples=0,normalMinimum=Infinity,normalMaximum=-Infinity;
  const examples=[];
  for(const row of triangles){
    const [u0,v0,u1,v1,u2,v2]=row.uv.map((value,index)=>value*(index%2?height:width));
    const abx=u1-u0,aby=v1-v0,acx=u2-u0,acy=v2-v0,determinant=abx*acy-aby*acx;
    if(Math.abs(determinant)<1e-20)continue;
    const minX=Math.max(0,Math.ceil(Math.min(u0,u1,u2)-.5)),maxX=Math.min(width-1,Math.floor(Math.max(u0,u1,u2)-.5));
    const minY=Math.max(0,Math.ceil(Math.min(v0,v1,v2)-.5)),maxY=Math.min(height-1,Math.floor(Math.max(v0,v1,v2)-.5));
    let visits=0;
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const dx=x+.5-u0,dy=y+.5-v0,b=(dx*acy-dy*acx)/determinant,c=(abx*dy-aby*dx)/determinant;
      if(b< -1e-7||c< -1e-7||b+c>1+1e-7)continue;
      const index=y*width+x,values=facts.readPixel(index),zeroAlpha=values[3]===0,black=values[0]+values[1]+values[2]===0;
      if(fallbackState?.mask.has(index))fallbackState.coverageHits.add(index);
      sampleVisits++;visits++;if(zeroAlpha)zeroAlphaSamples++;if(black)blackSamples++;
      if(channel==='Normal'&&!zeroAlpha){const nx=values[0]/limit*2-1,ny=values[1]/limit*2-1,nz=values[2]/limit*2-1,length=Math.sqrt(nx*nx+ny*ny+nz*nz);normalMinimum=Math.min(normalMinimum,length);normalMaximum=Math.max(normalMaximum,length);}
      if((zeroAlpha||black)&&examples.length<12)examples.push({object:row.object,triangle:row.triangle,x,y,rgba:values.map(value=>value/limit),zeroAlpha,black});
    }
    if(visits)trianglesWithSamples++;
  }
  return {method:'Rasterise actual GLB UV triangles at actual texture texel centres, including boundaries within 1e-7 barycentric precision; glTF UV and decoded PNG/WebP both use top-left image origin',
    sampleVisits,triangles:triangles.length,trianglesWithSamples,trianglesWithoutTexelCentreSamples:triangles.length-trianglesWithSamples,
    noPerTrianglePixelCentreRequirement:true,zeroAlphaSamples,blackSamples,
    ...(channel==='Normal'&&Number.isFinite(normalMinimum)?{decodedNormalLengthRange:[normalMinimum,normalMaximum]}:{}),examples};
}
function png(data){
  if(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Expected an actual PNG payload');
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20),depth=data[24],type=data[25];
  if(![8,16].includes(depth)||![2,6].includes(type)||data[26]||data[27]||data[28])throw Error('Expected non-interlaced 8/16-bit RGB/RGBA PNG');
  if(width!==resolution||height!==resolution)throw Error('PNG actual dimensions differ from the 4096 contract');
  const chunks=[];let position=8,end=false;
  while(position+12<=data.length){const size=data.readUInt32BE(position),kind=data.toString('ascii',position+4,position+8);if(position+12+size>data.length)throw Error('Truncated PNG chunk');if(kind==='IDAT')chunks.push(data.subarray(position+8,position+8+size));position+=size+12;if(kind==='IEND'){end=true;break;}}
  if(!end||!chunks.length)throw Error('PNG lacks image data or end chunk');
  const channels=type===6?4:3,bytes=depth/8,bpp=channels*bytes,stride=width*bpp,raw=inflateSync(Buffer.concat(chunks));
  if(raw.length!==(stride+1)*height)throw Error('PNG decoded scanline size mismatch');
  let previous=Buffer.alloc(stride),current=Buffer.alloc(stride),offset=0;
  const pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
  for(let row=0;row<height;row++){
    const filter=raw[offset++];if(filter>4)throw Error('Invalid PNG scanline filter');
    for(let i=0;i<stride;i++){const a=i>=bpp?current[i-bpp]:0,b=previous[i],c=i>=bpp?previous[i-bpp]:0;current[i]=(raw[offset++]+(filter===0?0:filter===1?a:filter===2?b:filter===3?((a+b)>>>1):paeth(a,b,c)))&255;}
    current.copy(pixels,row*stride);
    [previous,current]=[current,previous];
  }
  const values=[0,0,0,depth===16?65535:255];
  return withPixelAccess({...pixelFacts(width,height,depth,channels,index=>{for(let c=0;c<channels;c++){const at=index*bpp+c*bytes;values[c]=bytes===1?pixels[at]:pixels[at]*256+pixels[at+1];}return values;}),format:'png'},pixels);
}
let sharpRuntime;
async function imageFacts(data){
  if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return png(data);
  if(data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP')throw Error('Image payload is neither PNG nor WebP');
  sharpRuntime??=loadSharp();sharpRuntime.sharp.cache({memory:32});report.sharpModule=sharpRuntime.resolved;
  const image=sharpRuntime.sharp(data),metadata=await image.metadata();
  if(metadata.width!==resolution||metadata.height!==resolution||metadata.pages&&metadata.pages!==1)throw Error('WebP actual dimensions/pages differ from the single 4096 contract');
  const decoded=await image.raw({depth:'uchar'}).toBuffer({resolveWithObject:true}),{width,height,channels}=decoded.info;
  if(width!==resolution||height!==resolution||![3,4].includes(channels)||decoded.data.length!==width*height*channels)throw Error('WebP full decode has unexpected dimensions or channels');
  const values=[0,0,0,255];
  return withPixelAccess({...pixelFacts(width,height,8,channels,index=>{for(let c=0;c<channels;c++)values[c]=decoded.data[index*channels+c];return values;}),format:'webp',decodedPixelSha256:hash(decoded.data)},decoded.data);
}

try{
  const geometryBytes=fs.readFileSync(geometryFile),geometry=JSON.parse(geometryBytes.toString('utf8').replace(/^\uFEFF/,'')),bake=JSON.parse(fs.readFileSync(bakeFile,'utf8').replace(/^\uFEFF/,''));
  const projectedMode=bake.materialBakeMode==='projected-high-to-low-new-uv';
  require(!args.includes('--probe'),'Final LOD verifier does not accept a partial probe');
  require(bake.generator==='SichuanLod40kPbrV13','Actual V13 complete-PBR exporter report is supplied');
  require(geometry.generator==='SichuanQualityLod40kV13'||projectedMode&&geometry.generator==='SichuanLodProjectionGeometryV13','Independent actual V13 reduced/projection-geometry inventory is supplied');
  require(bake.partialProbe===false,'Final delivery is a complete five-part export');
  require(near(bake.resolutionPerPart??[],[resolution,resolution],0),'Bake resolution matches requested per-part maps',bake.resolutionPerPart);
  require(geometry.triangleLimit===triangleLimit&&geometry.totalTriangles>0&&geometry.totalTriangles<=triangleLimit,'Reduced geometry report respects the all-parts 40000-triangle ceiling',geometry.totalTriangles);
  if(projectedMode){
    require(geometry.allFivePartsRetained===true&&geometry.rootPivotAndPartOwnershipPreserved===true&&
      geometry.meshObjectsMergedForProjection===true&&geometry.allMeshObjectsRetained===false,
      'Projection honestly records merged mesh objects while retaining all five independent parts and the back-centre pivot');
  }else require(geometry.allFivePartsRetained===true&&geometry.allMeshObjectsRetained===true&&geometry.rootPivotTransformsAndParentsUnchanged===true&&geometry.readyForNormalTransfer===true,'Reduction retained all component ownership, transforms and valid mapped geometry');
  require(bake.savedSourceFileUnchanged===true&&bake.nativeSceneSavedOrRewritten===false,'Exporter retained the frozen native high source');
  evidence(bake.sourceBlend,'Frozen high source Blend');evidence(bake.sourceHighRuntime,'Baked high runtime source');
  if(bake.sourceLowBlend)evidence(bake.sourceLowBlend,'Saved reduced source Blend');
  const reductionBytes=evidence(bake.reduction,'Independent reduction report');
  require(reductionBytes.equals(geometryBytes),'Bake reduction provenance matches the supplied independent geometry inventory');
  const geometryObjects=new Map(),expectedObjects=new Map();
  require(Array.isArray(geometry.objects)&&geometry.objects.length>0&&Array.isArray(bake.objects),'Actual per-object geometry and bake inventories exist');
  for(const entry of geometry.objects){
    require(typeof entry.sourceName==='string'&&!geometryObjects.has(entry.sourceName)&&parts.includes(entry.part)&&Number.isInteger(entry.actualTriangles)&&entry.actualTriangles>0,'Geometry object identities, owners and actual triangle counts are unambiguous',entry.sourceName);
    require(entry.audit?.passed===true,'Reduced source object passed its actual geometry/UV audit',entry.sourceName);geometryObjects.set(entry.sourceName,entry);
  }
  for(const entry of bake.objects){
    const name=entry.canonicalName;
    require(typeof name==='string'&&entry.object===name&&!expectedObjects.has(name)&&parts.includes(entry.part),'Canonical export object identities and owners are unambiguous',name);
    const source=geometryObjects.get(name);
    require(source&&source.part===entry.part&&source.actualTriangles===entry.triangles,'Export object evidence agrees with the independent actual reduced inventory',{name,geometry:source?.actualTriangles,bake:entry.triangles});expectedObjects.set(name,entry);
  }
  require(geometryObjects.size===expectedObjects.size&&geometry.meshObjects===geometryObjects.size,'All reduced source objects are accounted for in final export evidence');
  for(const part of parts){
    const count=[...geometryObjects.values()].filter(o=>o.part===part).reduce((n,o)=>n+o.actualTriangles,0);
    require(count>0&&count===geometry.partTriangles?.[part]&&count===bake.actualGlb?.byPart?.[part],'Independent per-object, per-part and export report triangle sums agree',{part,count,geometry:geometry.partTriangles?.[part],bake:bake.actualGlb?.byPart?.[part]});
  }
  require(Object.values(geometry.partTriangles).reduce((a,b)=>a+b,0)===geometry.totalTriangles&&bake.actualGlb.totalTriangles===geometry.totalTriangles,'Independent all-part report triangle sums agree');
  const projection=projectionBakeEvidence(bake,geometry,expectedObjects);
  report.materialBakeMode??='retained-high-atlas-world-normal-transfer';
  const buffer=fs.readFileSync(model);report.sha256=hash(buffer);report.bytes=buffer.length;
  require(bake.glb?.sha256===report.sha256&&bake.glb?.bytes===buffer.length,'Actual GLB matches final exporter evidence');
  require(buffer.toString('ascii',0,4)==='glTF'&&buffer.readUInt32LE(4)===2&&buffer.readUInt32LE(8)===buffer.length,'Actual GLB 2 header and total length are valid');
  let document,binary,at=12;
  while(at<buffer.length){const length=buffer.readUInt32LE(at),type=buffer.readUInt32LE(at+4);at+=8;require(at+length<=buffer.length,'GLB chunk stays within the file');if(type===0x4e4f534a)document=JSON.parse(buffer.toString('utf8',at,at+length).replace(/[\0 ]+$/,''));if(type===0x004e4942)binary=buffer.subarray(at,at+length);at+=length;}
  const g=document;require(g?.asset?.version==='2.0'&&binary&&g.buffers?.length===1&&!g.buffers[0].uri,'GLB JSON and one embedded binary geometry buffer are present');
  require(g.images?.length===15,'The five complete Base/Normal/ORM sets contain fifteen actual images');
  require(g.materials?.length>0&&g.materials.every(m=>(m.alphaMode??'OPAQUE')==='OPAQUE'),'All cloth/straw materials are intentionally opaque, including RGB WebP maps');
  require(!g.extensionsRequired?.some(e=>['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(e)),'Geometry is available for independent binary inspection');
  const accessor=id=>{
    const a=g.accessors?.[id],v=g.bufferViews?.[a?.bufferView];if(!a||!v||a.sparse||v.buffer!==0)throw Error(`Unsupported or missing accessor ${id}`);
    const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size=sizes[a.componentType],n=components[a.type];
    if(!size||!n)throw Error(`Unsupported accessor format ${id}`);
    const offset=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??size*n;
    if(a.count&&(offset+(a.count-1)*stride+size*n>binary.length||stride<size*n))throw Error(`Accessor ${id} exceeds BIN`);
    const readers={5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},limits={5120:127,5121:255,5122:32767,5123:65535,5125:4294967295};
    return {count:a.count,components:n,get(i,c=0){let value=binary[readers[a.componentType]](offset+i*stride+c*size);return a.normalized?Math.max(-1,value/limits[a.componentType]):value;}};
  };
  require(g.scenes?.length===1,'One complete delivery scene');const roots=g.scenes[g.scene??0].nodes;
  require(roots.length===1&&g.nodes[roots[0]].name==='Pack_Root','One independent Pack_Root');
  require(near(matrix(g.nodes[roots[0]]),identity),'Pack_Root has the identity back-centre pivot');
  const partIds=Object.fromEntries(parts.map(p=>[p,g.nodes.flatMap((n,i)=>n.name===p?[i]:[])]));
  for(const p of parts)require(partIds[p].length===1&&g.nodes[roots[0]].children?.includes(partIds[p][0]),`${p} is a unique direct independent root child`);
  require(g.nodes[roots[0]].children?.length===parts.length,'The delivery root directly owns precisely the five independently controlled components');
  const seen=new Set(),seenObjects=new Set(),usedMeshes=new Set(),usedMaterials=new Set(),imageUses=new Map(),imageRoles=new Map();
  const partUvTriangles=Object.fromEntries(parts.map(part=>[part,[]]));
  for(const p of parts)report.parts[p]={triangles:0,meshNodes:[],bounds:bounds(),flatBackAreaM2:0,zeroAreaTriangles:0,zeroUvTriangles:0};
  function imageUse(info,part,channel){
    if(!info||info.texCoord&&info.texCoord!==0||info.extensions?.KHR_texture_transform)throw Error(`${part} ${channel} does not directly use its baked atlas/TEXCOORD_0`);
    const texture=g.textures?.[info.index],id=texture?.source??texture?.extensions?.EXT_texture_webp?.source,image=g.images?.[id],view=g.bufferViews?.[image?.bufferView];
    if(!Number.isInteger(id)||!view||view.buffer!==0||image.uri!==undefined)throw Error(`${part} ${channel} is not an embedded image`);
    if(texture?.source===undefined&&!g.extensionsRequired?.includes('EXT_texture_webp'))throw Error(`${part} ${channel} WebP-only source lacks its required extension declaration`);
    const key=`${part}:${channel}`,old=imageUses.get(key),oldRole=imageRoles.get(id);
    if(old!==undefined&&old!==id)throw Error(`${part} unexpectedly uses multiple ${channel} atlases`);
    if(oldRole!==undefined&&oldRole!==key)throw Error(`Image ${id} is shared across incompatible part/channel roles`);
    imageUses.set(key,id);imageRoles.set(id,key);return id;
  }
  function walk(id,parentMatrix,owner){
    if(seen.has(id))throw Error('GLB contains repeated or cyclic node ancestry');seen.add(id);
    const n=g.nodes[id],world=mul(parentMatrix,matrix(n));if(parts.includes(n.name))owner=n.name;
    if(n.mesh!==undefined){
      require(parts.includes(owner),'All actual geometry belongs to an independent component',n.name);usedMeshes.add(n.mesh);
      require(!seenObjects.has(n.name),'Every canonical mesh object is unique in the actual scene',n.name);seenObjects.add(n.name);
      const part=report.parts[owner];part.meshNodes.push(n.name);let triangles=0,badNormals=0,badTangents=0,nonfinite=0,uvOutside=0,minimumArea=Infinity,explicitTangentPrimitives=0,derivedTangentPrimitives=0;
      for(const primitive of g.meshes[n.mesh].primitives){
        const attrs=primitive.attributes;require((primitive.mode??4)===4&&['POSITION','NORMAL','TEXCOORD_0'].every(k=>attrs[k]!==undefined),`${n.name} has actual triangles, normals and its baked atlas UV`);
        const positions=accessor(attrs.POSITION),normals=accessor(attrs.NORMAL),tangents=attrs.TANGENT===undefined?null:accessor(attrs.TANGENT),uv=accessor(attrs.TEXCOORD_0),indices=primitive.indices===undefined?null:accessor(primitive.indices),count=indices?.count??positions.count;
        if(tangents)explicitTangentPrimitives++;else derivedTangentPrimitives++;
        require(count>0&&count%3===0&&positions.components===3&&normals.components===3&&normals.count===positions.count&&(!tangents||tangents.components===4&&tangents.count===positions.count)&&uv.components===2&&uv.count===positions.count&&(!indices||indices.components===1),`${n.name} vertex/index streams agree`);
        const points=new Float64Array(positions.count*3);
        for(let i=0;i<positions.count;i++){
          const p=transform(world,positions.get(i,0),positions.get(i,1),positions.get(i,2));points.set(p,i*3);include(part.bounds,p);
          let n2=0,t2=0,dot=0;for(let c=0;c<3;c++){const a=normals.get(i,c),b=tangents?.get(i,c)??0;if(!Number.isFinite(p[c])||!Number.isFinite(a)||!Number.isFinite(b))nonfinite++;n2+=a*a;t2+=b*b;dot+=a*b;}
          if(Math.abs(n2-1)>.02)badNormals++;
          if(tangents){const handedness=tangents.get(i,3);if(!Number.isFinite(handedness))nonfinite++;if(Math.abs(t2-1)>.02||Math.abs(dot)>.03||Math.abs(Math.abs(handedness)-1)>1e-5)badTangents++;}
          for(let c=0;c<2;c++){const value=uv.get(i,c);if(!Number.isFinite(value))nonfinite++;if(value<-1e-5||value>1.00001)uvOutside++;}
        }
        const getIndex=i=>indices?indices.get(i):i;
        for(let i=0;i<count;i+=3){
          const ids=[getIndex(i),getIndex(i+1),getIndex(i+2)];if(ids.some(v=>!Number.isInteger(v)||v<0||v>=positions.count))throw Error(`${n.name} has an invalid vertex index`);
          const a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,ab=[0,1,2].map(k=>points[b+k]-points[a+k]),ac=[0,1,2].map(k=>points[c+k]-points[a+k]);
          const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],area=Math.hypot(...cross)/2;minimumArea=Math.min(minimumArea,area);if(area<1e-16)part.zeroAreaTriangles++;
          const u0=uv.get(ids[0],0),v0=uv.get(ids[0],1),u1=uv.get(ids[1],0),v1=uv.get(ids[1],1),u2=uv.get(ids[2],0),v2=uv.get(ids[2],1);
          if(projection)partUvTriangles[owner].push({object:n.name,triangle:triangles+i/3,uv:[u0,v0,u1,v1,u2,v2]});
          if(Math.abs((u1-u0)*(v2-v0)-(v1-v0)*(u2-u0))<1e-20)part.zeroUvTriangles++;
          if(owner==='Pack_Bundle'&&ids.every(v=>Math.abs(points[v*3+2])<=2e-5)&&cross[2]<0)part.flatBackAreaM2+=-cross[2]/2;
        }
        triangles+=count/3;
        const material=g.materials?.[primitive.material],pbr=material?.pbrMetallicRoughness;require(pbr,`${n.name} has a real standard PBR material`);usedMaterials.add(primitive.material);
        imageUse(pbr.baseColorTexture,owner,'Base');imageUse(material.normalTexture,owner,'Normal');const orm=imageUse(pbr.metallicRoughnessTexture,owner,'Orm'),ao=imageUse(material.occlusionTexture,owner,'Orm');require(orm===ao,`${n.name} shares ORM between roughness/metallic and AO`);
        check((pbr.roughnessFactor??1)===1&&(pbr.metallicFactor??1)>=0&&(pbr.metallicFactor??1)<=1,`${n.name} keeps valid untampered PBR factors`);
      }
      require(!nonfinite&&!badNormals&&!badTangents&&!uvOutside,`${n.name} actual binary attributes are finite and valid`,{nonfinite,badNormals,badTangents,uvOutside});
      const expected=expectedObjects.get(n.name),independent=geometryObjects.get(n.name);require(expected&&expected.part===owner&&expected.triangles===triangles&&independent?.actualTriangles===triangles,`${n.name} actual triangles match independent reduced-source and export evidence`,{actual:triangles,geometry:independent?.actualTriangles,bake:expected?.triangles});
      const before=expected.sourceGeometryAndUvs,after=expected.sourceGeometryAndUvsAfterBake;
      require(before&&typeof before.geometryAndUvSha256==='string'&&Object.keys(before.uvLayerHashes??{}).length>0&&typeof before.cornerNormalSha256==='string'&&before.triangles===triangles&&same(before,after),`${n.name} low geometry, UVs and corner normals stayed unchanged during transfer/export`);
      require(expected.exportTexCoord===0&&expected.sourceUv===before.activeAtlasUv&&expected.exportUv===expected.sourceUv,`${n.name} explicitly retains its actual active atlas UV as TEXCOORD_0`);
      part.triangles+=triangles;report.objects.push({name:n.name,part:owner,triangles,minimumTriangleAreaM2:minimumArea,explicitTangentPrimitives,derivedTangentPrimitives,
        tangentPolicy:derivedTangentPrimitives?'glTF permits runtime tangent derivation from non-degenerate POSITION/NORMAL/TEXCOORD_0; inspect the actual renderer for seam fidelity':'Explicit tangent basis checked for unit length, normal orthogonality and handedness'});
    }
    for(const child of n.children??[])walk(child,world,owner);
  }
  walk(roots[0],identity,null);
  require(!g.nodes.some((n,i)=>n.mesh!==undefined&&!seen.has(i))&&usedMeshes.size===g.meshes.length,'Every delivered mesh resource is included in actual counts');
  require(report.objects.length===bake.objects.length&&report.objects.length===geometryObjects.size,'All recorded reduced-source objects are present exactly once');
  require(imageUses.size===15&&imageRoles.size===15&&imageRoles.size===g.images.length,'Every delivered image has exactly one of the fifteen actual part/channel roles');
  for(const p of parts){
    const part=report.parts[p];part.bounds=finish(part.bounds);require(part.triangles===geometry.partTriangles[p]&&part.triangles===bake.actualGlb.byPart[p],`${p} actual triangles agree with the independent reduced geometry`,{actual:part.triangles,geometry:geometry.partTriangles[p]});
    check(!part.zeroAreaTriangles&&!part.zeroUvTriangles,`${p} has no zero-area geometry or exact zero-area active UV triangles`,{geometry:part.zeroAreaTriangles,uv:part.zeroUvTriangles});
    part.hideScope={removedTriangles:part.triangles,otherPartTrianglesUnaffected:true,method:'Every mesh has exactly this direct-root owner; removing this subtree removes only these descendants'};
  }
  {
    const b=report.parts.Pack_Bundle;check(near(b.bounds.size,[.38,.30,.13],.015),'Actual meter-scale bounds establish glTF Y-up orientation',b.bounds);
    check(Math.abs(b.bounds.center[0])<.005&&Math.abs(b.bounds.center[1])<.005&&b.bounds.min[2]>=-.001,'Back-centre pivot and rear contact are preserved',b.bounds);
    check(b.flatBackAreaM2>=.38*.30*.55,'A substantial real contact surface is flat at glTF Z=0 facing -Z',b.flatBackAreaM2);
    const j=report.parts.Pack_Jacket,delta=[0,.36,.30];report.jacketWithdrawal={translationM:delta,allOwnedMeshNodes:j.meshNodes,triangles:j.triangles,oldBounds:j.bounds,newBounds:{min:j.bounds.min.map((v,i)=>v+delta[i]),max:j.bounds.max.map((v,i)=>v+delta[i])},sizeUnchanged:true,method:'One rigid translation on the independent Pack_Jacket root applies to every complete garment/button descendant'};
  }
  const fallback=projection?nearestSurfaceFallbackEvidence(projection,bake):null;
  for(const p of parts)for(const channel of ['Base','Normal','Orm']){
    const id=imageUses.get(`${p}:${channel}`),image=g.images[id],view=g.bufferViews[image.bufferView],data=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),entry=bake.atlases?.[p]?.images?.[channel];
    require(entry,`${p} ${channel} has independent bake evidence`);const sha256=hash(data);require(sha256===entry.sha256&&data.length===entry.bytes,`${p} ${channel} embedded bytes match the actual bake`);
    if(projection){
      const source=projection.atlases?.[p]?.images?.[channel];
      require(source&&source.sha256===sha256&&source.bytes===data.length&&source.width===resolution&&source.height===resolution&&
        source.colourSpace===(channel==='Base'?'sRGB':'Non-Color'),`${p} ${channel} has matching actual independent high-to-low projection output`);
      const original=evidence(source,`${p} ${channel} original ProjectionBake map`);
      require(original.equals(data),`${p} ${channel} final embedded image is the real new-UV projection map`);
    }
    const external=evidence(entry,`${p} ${channel} external map`);require(external.equals(data),`${p} ${channel} whole external and embedded image payloads are identical`);
    const facts=await imageFacts(data),mimeType=facts.format==='png'?'image/png':'image/webp';require(facts.width===resolution&&facts.height===resolution,`${p} ${channel} fully decodes at the actual requested resolution`,[facts.width,facts.height]);
    check(image.mimeType===mimeType&&entry.mimeType===mimeType,`${p} ${channel} declared image formats match the actual PNG/WebP payload`,{embedded:image.mimeType,evidence:entry.mimeType,actual:mimeType});
    check(entry.width===resolution&&entry.height===resolution,`${p} ${channel} independent dimensions agree with actual decoded pixels`);
    if(entry.imageIndex!==undefined)check(entry.imageIndex===id,`${p} ${channel} actual image index matches extraction evidence`);
    check(entry.colourSpace===(channel==='Base'?'sRGB':'Non-Color'),`${p} ${channel} bake has the right colour-space semantic`,entry.colourSpace);
    check(facts.alphaMarkedPixels>0&&facts.nonBlackAlphaMarkedPixels>0,`${p} ${channel} actually contains nonblack baked surface pixels`);
    if(channel==='Base')check(Math.max(...facts.maximum.slice(0,3))>.005&&facts.maximum.slice(0,3).some((v,i)=>v-facts.minimum[i]>.001),`${p} Base has actual surface colour variation`);
    if(channel==='Normal')check(facts.maximum[2]>.5,`${p} Normal contains tangent-space normal data`);
    if(channel==='Orm')check(facts.minimum[2]===0&&facts.maximum[2]===0&&facts.maximum[1]>.7,`${p} ORM is entirely nonmetal and contains dry roughness`,{metallicRange:[facts.minimum[2],facts.maximum[2]],roughnessRange:[facts.minimum[1],facts.maximum[1]]});
    const fallbackImage=await verifyFallbackImage(fallback,p,channel,data);
    const coverage=projection?projectionCoverage(partUvTriangles[p],facts,channel,fallback?.states.get(p)):null;
    if(coverage)check(coverage.sampleVisits>0&&coverage.zeroAlphaSamples===0&&coverage.blackSamples===0,
      `${p} ${channel} actual mapped projection texels contain written nonblack surface data`,coverage);
    report.images.push({part:p,channel,image:id,name:image.name,bytes:data.length,sha256,...facts,...(coverage?{coverage}:{}),...(fallbackImage?{nearestSurfaceTransfer:fallbackImage}:{})});
    if(channel==='Orm'&&fallback?.states.has(p))fallback.states.get(p).before=null;
  }
  if(fallback)for(const [part,state]of fallback.states){
    const missing=state.indices.filter(index=>!state.coverageHits.has(index));
    check(missing.length===0,'Every corrected fallback texel lies in the actual final GLB UV coverage',{part,corrected:state.indices.length,covered:state.coverageHits.size,missing:missing.slice(0,12).map(index=>({index,x:index%resolution,y:Math.floor(index/resolution)}))});
    require(state.verifiedChannels.length===3,'All three fallback channel before/after inputs were independently verified',part);
    report.nearestSurfaceFallback.parts[part]={correctedTexels:state.row.correctedTexels,correctedPixels:state.indices.length,actualFinalUvCovered:missing.length===0,
      excludedHighTrianglesWithInvalidSourceAtlasCentroids:state.row.excludedHighTrianglesWithInvalidSourceAtlasCentroids,maximumNearestSurfaceDistanceM:state.row.maximumNearestSurfaceDistanceM,
      additionalDistanceEvidence:Object.fromEntries(Object.entries(state.row).filter(([key])=>/Distance|Bound|Shift/.test(key)&&key!=='maximumNearestSurfaceDistanceM')),
      sourceSamples:state.row.samples,channels:state.channelEvidence};
  }
  report.totalTriangles=parts.reduce((n,p)=>n+report.parts[p].triangles,0);report.expectedReducedTriangles=geometry.totalTriangles;
  check(report.totalTriangles>0&&report.totalTriangles<=triangleLimit&&report.totalTriangles===report.expectedReducedTriangles,'Actual all-parts total matches reduced inventory and stays within 40000 triangles',{actual:report.totalTriangles,expected:report.expectedReducedTriangles,limit:triangleLimit});
  report.upAxis='+Y';report.units='metres, independently checked from physical bounds';report.textureResolutionPerPart=resolution;
  report.reductionEvidence={reportSha256:hash(geometryBytes),sourceHighTriangles:geometry.sourceTriangles,reducedTriangles:geometry.totalTriangles,objects:geometryObjects.size,highCountIsSourceOnly:true};
  report.sourceGeometryAndUvPolicy=projection?
    'Low UV is newly unwrapped before projection; positions/topology/material indices/corner normals remain the same across unwrap. New low atlas UV and basis are unchanged around actual bake/export. No old high atlas byte or UV inheritance is claimed':
    'Each low-source object retains its own before/after transfer geometry, UV and normal hashes; no identity with high-source topology is claimed';
}catch(error){check(false,'Independent audit completed without parsing/runtime errors',error.stack??String(error));}
report.passed=report.checks.every(c=>c.ok);report.finalDeliveryStructurallyVerified=report.passed;report.failed=report.checks.filter(c=>!c.ok).length;
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,finalDeliveryStructurallyVerified:report.finalDeliveryStructurallyVerified,checks:report.checks.length,failed:report.failed,totalTriangles:report.totalTriangles,triangleBudget:triangleLimit,report:output}));
process.exitCode=report.passed?0:1;
