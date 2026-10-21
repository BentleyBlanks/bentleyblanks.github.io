// Package the already-reduced <=40000-triangle V13 export. Geometry is copied
// byte-for-byte RELATIVE TO RAW V13, never described as unreduced high geometry.
// node <this.mjs> raw.glb --out=<new directory> [--bake=<report.json>] [--external]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {fileEvidence,loadSharp,readGlb,viewBytes,triangleCounts,geometryAccessors,
  geometryEvidence,imageFiles,writeAtomic,writeGlb,hashFileRanges,externalPackage}
  from './Script_SichuanQualityPackageV12.mjs';

const GENERATOR='SichuanLod40kPbrV13',RESOLUTION=4096,LIMIT=40000;
const PROJECTED_MODE='projected-high-to-low-new-uv',INHERITED_MODE='inherited-high-atlas-normal-transfer';
const hash=b=>createHash('sha256').update(b).digest('hex');
const ensure=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameCounts=(a,b)=>b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
function kind(bytes){return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;}
function losslessWebp(bytes){
  let lossless=false;
  for(let p=12;p+8<=bytes.length;){const n=bytes.readUInt32LE(p+4),type=bytes.toString('ascii',p,p+4);if(p+8+n>bytes.length)return false;if(type==='VP8 ')return false;if(type==='VP8L')lossless=true;p+=8+n+(n&1);}return lossless;
}
function imageRoles(g){
  const roles=new Map(),parts=['Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'];
  function assign(info,part,channel){ensure(info,'LOD material lost '+channel);const t=g.textures[info.index],id=t.source??t.extensions?.EXT_texture_webp?.source;ensure(Number.isInteger(id),'LOD texture lacks its actual image');
    const old=roles.get(id);ensure(!old||old.part===part&&old.channel===channel,'LOD image is shared across incompatible part/channel roles');roles.set(id,{part,channel});return id;}
  function walk(id,owner){const n=g.nodes[id];if(parts.includes(n.name))owner=n.name;if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){const m=g.materials[p.material],v=m.pbrMetallicRoughness;assign(v.baseColorTexture,owner,'Base');assign(m.normalTexture,owner,'Normal');ensure(assign(v.metallicRoughnessTexture,owner,'Orm')===assign(m.occlusionTexture,owner,'Orm'),'LOD AO and roughness/metallic images differ');}for(const child of n.children??[])walk(child,owner);}
  for(const id of g.scenes[g.scene??0].nodes)walk(id,null);ensure(roles.size===15,'LOD must retain five sets of Base/Normal/ORM');return roles;
}
function webpReferences(g){
  for(const t of g.textures){const source=t.source??t.extensions?.EXT_texture_webp?.source;ensure(Number.isInteger(source),'Source texture lacks PNG/WebP image');t.extensions={...(t.extensions??{}),EXT_texture_webp:{source}};delete t.source;}
  g.extensionsUsed=[...new Set([...(g.extensionsUsed??[]),'EXT_texture_webp'])];g.extensionsRequired=[...new Set([...(g.extensionsRequired??[]),'EXT_texture_webp'])];
}
function readHighImageIndex(file){
  const fd=fs.openSync(file,'r');try{const h=Buffer.alloc(20);fs.readSync(fd,h,0,20,0);ensure(h.toString('ascii',0,4)==='glTF'&&h.readUInt32LE(4)===2&&h.readUInt32LE(16)===0x4e4f534a,'Expected retained high runtime GLB');
    const n=h.readUInt32LE(12),text=Buffer.alloc(n);ensure(fs.readSync(fd,text,0,n,20)===n,'Truncated high runtime JSON');const g=JSON.parse(text.toString('utf8').replace(/[\0 ]+$/,'')),roles=imageRoles(g),byRole=new Map([...roles].map(([id,r])=>[r.part+':'+r.channel,id]));
    return {file,g,binStart:28+n,byRole};
  }finally{fs.closeSync(fd);}
}
function highImageBytes(reference,id){
  const image=reference.g.images[id],view=reference.g.bufferViews[image.bufferView];ensure(view&&view.buffer===0,'High runtime image is not embedded');
  const fd=fs.openSync(reference.file,'r'),bytes=Buffer.alloc(view.byteLength);try{ensure(fs.readSync(fd,bytes,0,bytes.length,reference.binStart+(view.byteOffset??0))===bytes.length,'Truncated high runtime image');return bytes;}finally{fs.closeSync(fd);}
}

// Projection changes the atlas UVs before baking. Its actual output images,
// rather than the old high-atlas pixels, are the source of the runtime maps.
async function projectionEvidence(bake,highRuntime){
  ensure(bake.originalHighAtlasBytesClaimedInherited===false,'Projected maps must explicitly disclaim inherited high-atlas bytes');
  const supplied=bake.projectionBake;ensure(supplied?.path,'Projected export lacks its independent actual bake report');
  const actual=await fileEvidence(supplied.path);ensure(actual.bytes===supplied.bytes&&actual.sha256===supplied.sha256,'Projection bake report changed after export');
  const report=JSON.parse(fs.readFileSync(actual.path,'utf8').replace(/^\uFEFF/,''));
  ensure(report.generator==='SichuanLodProjectionBakeV13'&&report.partialProbe===false&&report.selectedToActive===true&&report.rayProjectionUsed===true&&same(report.resolutionPerPart,[RESOLUTION,RESOLUTION]),'Only a complete actual selected-to-active 4K V13 projection bake may be packaged');
  ensure(report.sourceHighRuntime?.sha256===highRuntime.sha256&&report.sourceHighRuntime?.bytes===highRuntime.bytes,'Projection report is not bound to the retained actual high runtime');
  const highBlend=await fileEvidence(report.sourceHighBlend?.path??'');
  ensure(highBlend.bytes===report.sourceHighBlend.bytes&&highBlend.sha256===report.sourceHighBlend.sha256&&highBlend.bytes===bake.sourceBlend?.bytes&&highBlend.sha256===bake.sourceBlend?.sha256,'Projection report is not bound to the retained actual high Blend');
  ensure(Array.isArray(report.objects)&&report.objects.length>0,'Projection report lacks actual High/Low mesh evidence');
  const high=report.objects.filter(o=>o.kind==='High'),low=report.objects.filter(o=>o.kind==='Low');
  ensure(high.length>0&&low.length>0&&high.length+low.length===report.objects.length,'Projection report must distinguish its actual High and Low meshes');
  for(const object of high)ensure(object.before&&same(object.before,object.after),'Projection changed actual high geometry/UVs: '+object.originalName);
  const indexed=new Map();
  for(const object of low){
    const name=object.originalName??object.sourceName??object.object,key=object.part+':'+name;
    ensure(name&&!indexed.has(key),'Projection report repeats or omits a Low mesh identity');
    ensure(object.beforeReunwrap?.geometryOnlySha256&&object.beforeReunwrap.geometryOnlySha256===object.afterReunwrap?.geometryOnlySha256,'Re-unwrapping changed actual low geometry: '+name);
    ensure(object.before&&same(object.before,object.after),'Projection changed actual low geometry/new UVs after its baseline: '+name);indexed.set(key,object);
  }
  ensure(indexed.size===(bake.objects??[]).length,'Raw export and projection report have different Low mesh inventories');
  for(const object of bake.objects??[]){
    const name=object.sourceName??object.object,row=indexed.get(object.part+':'+name);
    ensure(row&&same(row.before,object.sourceGeometryAndUvs)&&same(row.after,object.sourceGeometryAndUvsAfterBake),'Raw export is not bound to the actual projected Low mesh/new UV evidence: '+name);
  }
  ensure(report.atlases&&Object.keys(report.atlases).length===5,'Projection report must contain all five actual part atlases');
  const outputs=new Map();
  for(const part of ['Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'])for(const channel of ['Base','Normal','Orm']){
    const record=report.atlases[part]?.images?.[channel];ensure(record?.path,'Projection report lost actual '+part+' '+channel+' output');
    const file=await fileEvidence(record.path);ensure(file.bytes===record.bytes&&file.sha256===record.sha256,'A projected source image changed: '+part+' '+channel);
    outputs.set(part+':'+channel,file);
  }
  return {evidence:actual,highBlend,report,outputs};
}

export async function PackageSichuanLodV13(rawFile,bakeFile,outDir,{name=null,forceExternal=false}={}){
  rawFile=path.resolve(rawFile);bakeFile=path.resolve(bakeFile);outDir=path.resolve(outDir);const outputName=name??path.basename(rawFile);
  ensure(path.basename(outputName)===outputName&&outputName.toLowerCase().endsWith('.glb'),'Explicit runtime name must be a GLB basename');
  const outputFile=path.join(outDir,outputName);ensure(outputFile.toLowerCase()!==rawFile.toLowerCase(),'Do not overwrite raw diagnostic GLB');
  const bakeBytes=fs.readFileSync(bakeFile),bake=JSON.parse(bakeBytes.toString('utf8').replace(/^\uFEFF/,''));
  ensure(bake.generator===GENERATOR&&bake.partialProbe===false&&same(bake.resolutionPerPart,[RESOLUTION,RESOLUTION]),'Expected the complete V13 4k LOD bake report');
  const materialBakeMode=bake.materialBakeMode??INHERITED_MODE,isProjected=materialBakeMode===PROJECTED_MODE;
  ensure(isProjected||materialBakeMode===INHERITED_MODE,'Unrecognised V13 material bake mode');
  const source=readGlb(rawFile),g=source.document,rawSha=hash(source.bytes),counts=triangleCounts(g),total=Object.values(counts).reduce((a,b)=>a+b,0);
  ensure(total>0&&total<=LIMIT&&sameCounts(counts,bake.actualGlb.byPart),'Raw V13 counts differ from report or exceed 40000');
  ensure(rawSha===bake.glb.sha256&&source.bytes.length===bake.glb.bytes,'Raw V13 GLB hash differs from its bake report');
  ensure(g.images?.length===15&&(g.materials??[]).every(m=>(m.alphaMode??'OPAQUE')==='OPAQUE'),'Expected fifteen PBR images and opaque LOD materials');
  ensure(!(g.extensionsRequired??[]).some(e=>['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(e)),'Native bufferView byte-preservation requires uncompressed raw geometry');
  for(const o of bake.objects??[])ensure(same(o.sourceGeometryAndUvs,o.sourceGeometryAndUvsAfterBake),'Baking changed the low source geometry or UVs after its atlas baseline: '+o.object);
  ensure(bake.sourceHighRuntime?.path,'V13 needs the retained actual high runtime provenance');
  const highRuntime=await fileEvidence(bake.sourceHighRuntime.path);ensure(highRuntime.sha256===bake.sourceHighRuntime.sha256&&highRuntime.bytes===bake.sourceHighRuntime.bytes,'Retained high runtime no longer matches raw V13 provenance');
  const highImages=readHighImageIndex(highRuntime.path);
  const highCounts=triangleCounts(highImages.g),highTotal=Object.values(highCounts).reduce((a,b)=>a+b,0);ensure(highTotal>total,'Retained high runtime is not a higher-detail source than the raw V13 LOD');
  const projection=isProjected?await projectionEvidence(bake,highRuntime):null;
  const imageViews=new Set(g.images.map(i=>i.bufferView));ensure(!imageViews.has(undefined)&&imageViews.size===g.images.length,'Raw mixed PNG/WebP images require independent embedded views');
  ensure([...geometryAccessors(g)].every(id=>!imageViews.has(id)),'An image view is also used by geometry');
  const geometryIds=g.bufferViews.flatMap((v,id)=>imageViews.has(id)?[]:[id]),before=geometryEvidence(source,geometryIds),roles=imageRoles(g);
  const {sharp,resolved}=loadSharp();sharp.cache({memory:32});const runtime=JSON.parse(JSON.stringify(g)),names=imageFiles(g),webps=[],images=[],replacements=new Map();
  fs.mkdirSync(outDir,{recursive:true});
  for(let id=0;id<g.images.length;id++){
    const image=g.images[id],input=viewBytes(source,image.bufferView),format=kind(input),role=roles.get(id);ensure(format,'Raw V13 image must be actual PNG or WebP: '+image.name);
    ensure(image.mimeType===undefined||image.mimeType===(format==='png'?'image/png':'image/webp'),'Raw image MIME disagrees with its payload');
    const rgb=await sharp(input).removeAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
    ensure(rgb.info.width===RESOLUTION&&rgb.info.height===RESOLUTION&&rgb.info.channels===3,'No source texture resize/channel change is permitted');
    let highSource=null,projectedSource=null;
    if(isProjected){
      projectedSource=projection.outputs.get(role.part+':'+role.channel);
      ensure(projectedSource&&projectedSource.bytes===input.length&&projectedSource.sha256===hash(input),'Raw GLB image differs from its actual projection output: '+role.part+' '+role.channel);
    }else if(role.channel==='Base'||role.channel==='Orm'){
      const highId=highImages.byRole.get(role.part+':'+role.channel);ensure(highId!==undefined,'Retained high runtime lacks a matching Base/ORM role');
      const bytes=highImageBytes(highImages,highId),pixels=await sharp(bytes).removeAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
      ensure(pixels.info.width===RESOLUTION&&pixels.info.height===RESOLUTION&&pixels.info.channels===3&&pixels.data.equals(rgb.data),'Low '+role.part+' '+role.channel+' pixels differ from frozen V12 runtime');
      highSource={image:highId,imageSha256:hash(bytes),decodedRgb8Sha256:hash(pixels.data),rgb8Exact:true};
    }
    const copiedOriginalWebp=format==='webp'&&losslessWebp(input);
    const webp=copiedOriginalWebp?input:await sharp(rgb.data,{raw:{width:RESOLUTION,height:RESOLUTION,channels:3}}).webp({lossless:true,nearLossless:false,effort:6}).toBuffer();
    const decoded=await sharp(webp).removeAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true}),rgbSha=hash(rgb.data),decodedSha=hash(decoded.data);
    ensure(decoded.info.width===RESOLUTION&&decoded.info.height===RESOLUTION&&decoded.info.channels===3&&rgbSha===decodedSha&&rgb.data.equals(decoded.data),'V13 WebP RGB8 roundtrip changed pixels');
    const sourceBitDepth=format==='png'?input[24]:8;
    runtime.images[id]={...runtime.images[id],mimeType:'image/webp'};delete runtime.images[id].uri;replacements.set(image.bufferView,webp);webps.push(webp);
    images.push({image:id,name:image.name,...role,bufferView:image.bufferView,sourceMimeType:format==='png'?'image/png':'image/webp',sourceImageBytes:input.length,sourceImageSha256:hash(input),sourceBitDepth,
      width:RESOLUTION,height:RESOLUTION,runtimeChannels:3,runtimeBitDepth:8,alphaRemoved:true,allUsingMaterialsOpaque:true,
      sourceDecodedRgb8Bytes:rgb.data.length,sourceDecodedRgb8Sha256:rgbSha,webpDecodedRgb8Bytes:decoded.data.length,webpDecodedRgb8Sha256:decodedSha,rgb8RoundtripExact:true,
      webpBytes:webp.length,webpSha256:hash(webp),copiedOriginalWebp,runtimeBytesEqualInput:input.equals(webp),externalFilename:names[id],
      highRuntimeSource:highSource,projectionBakeSource:projectedSource,projectedHighToLowV13:isProjected,normalRebakedV13:role.channel==='Normal',
      precisionPolicy:sourceBitDepth>8?'Intentional PNG16 to RGB8 quantisation; subsequent lossless WebP is byte-exact to decoded RGB8':'Existing decoded RGB8 preserved; source lossless WebP bytes copied without re-encoding when available'});
    console.log(JSON.stringify({stage:'LodV13RuntimeImage',image:id+1,of:15,...role,inputFormat:format,copiedOriginalWebp,webpBytes:webp.length,rgb8RoundtripExact:true}));
  }
  webpReferences(runtime);const payloads=g.bufferViews.map((v,id)=>replacements.get(id)??viewBytes(source,id)),layout=writeGlb(outputFile,runtime,payloads);
  ensure(same(runtime.meshes,g.meshes)&&same(runtime.nodes,g.nodes)&&same(runtime.scenes,g.scenes)&&same(runtime.accessors,g.accessors),'Packaging changed raw LOD geometry/index/hierarchy JSON');
  const actual=hashFileRanges(outputFile,geometryIds.map(id=>({bufferView:id,offset:layout.binStart+runtime.bufferViews[id].byteOffset,bytes:runtime.bufferViews[id].byteLength})));
  ensure(same(before.views,actual.views)&&before.orderedNonImageViewPayloadSha256===actual.orderedNonImageViewPayloadSha256,'Saved runtime geometry differs from raw V13 payloads');
  const runtimeEvidence=await fileEvidence(outputFile);let external=null;
  if(forceExternal||runtimeEvidence.bytes>95_000_000)external=await externalPackage(outDir,path.basename(outputName,path.extname(outputName)),runtime,source,geometryIds,webps,names,before);
  const rawAfter=await fileEvidence(rawFile);ensure(rawAfter.sha256===rawSha&&rawAfter.bytes===source.bytes.length,'Raw V13 diagnostic changed during packaging');
  if(projection){const after=await fileEvidence(projection.evidence.path);ensure(after.bytes===projection.evidence.bytes&&after.sha256===projection.evidence.sha256,'Projection bake report changed during packaging');}
  const report={generator:GENERATOR,reportType:'runtime-package',sourceRawGlb:{path:rawFile,bytes:source.bytes.length,sha256:rawSha},sourceBakeReport:{path:bakeFile,bytes:bakeBytes.length,sha256:hash(bakeBytes)},
    sourceBlend:bake.sourceBlend,sourceHighRuntime:highRuntime,sourceLowBlend:bake.sourceLowBlend??bake.lowBlend??null,reduction:bake.reduction??bake.reductionReport??null,
    materialBakeMode,projectionBake:projection?.evidence??null,originalHighAtlasBytesClaimedInherited:!isProjected,
    runtimeGlb:runtimeEvidence,sharpModule:resolved,resolutionPerPart:[RESOLUTION,RESOLUTION],triangleBudget:LIMIT,totalTriangles:total,partTrianglesBefore:counts,partTrianglesAfter:triangleCounts(runtime),
    sourceHighRuntimeTotalTriangles:highTotal,sourceHighRuntimeTrianglesByPart:highCounts,
    rawGeometryPreserved:true,geometryReducedDuringPackaging:false,reductionAppliedBeforePackaging:true,
    geometryAttributesOrIndicesRewritten:false,geometryAccessorIdsCountsAndFormatsUnchanged:true,geometryBufferViewIdsUnchangedInGlb:true,
    geometryViewEvidenceBefore:before,geometryViewEvidenceAfter:actual,geometryBinaryPayloadSha256:before.orderedNonImageViewPayloadSha256,
    geometryHashMeaning:'Ordered non-image bufferView payloads of the already-reduced RAW V13; no equality to high-master topology is claimed',
    imageCount:15,images,allRgb8RoundtripsExact:true,imageResolutionChanged:false,
    originalLosslessWebpBaseOrmKept:!isProjected&&images.filter(i=>i.channel==='Base'||i.channel==='Orm').every(i=>i.sourceMimeType==='image/webp'&&i.copiedOriginalWebp),
    baseOrmPreservedFromHighRuntime:!isProjected&&images.filter(i=>i.channel==='Base'||i.channel==='Orm').every(i=>i.highRuntimeSource?.rgb8Exact),newV13NormalImageCount:images.filter(i=>i.normalRebakedV13).length,
    projectedPbrImageCount:images.filter(i=>i.projectedHighToLowV13).length,allRawImagesMatchProjectionOutputs:isProjected?images.every(i=>i.projectionBakeSource?.sha256===i.sourceImageSha256&&i.projectionBakeSource?.bytes===i.sourceImageBytes):null,
    texturePrecision:isProjected?'Fifteen actual high-to-low projection images verified byte-for-byte against raw GLB payloads; PNG diagnostics quantised to RGB8 only when higher precision; all runtime WebPs lossless relative to exact decoded RGB8':'V12 Base/ORM decoded RGB8 verified exact against frozen high runtime; PNG diagnostics quantised to RGB8 only when higher precision; all runtime WebPs lossless relative to exact decoded RGB8',
    textureExtension:'EXT_texture_webp',extensionRequired:true,pngFallback:false,sourceDiagnosticImagesModified:false,sourceDiagnosticGlbUnchanged:true,
    externalThresholdBytes:95_000_000,individualFileSafetyLimitBytes:100_000_000,runtimeGlbBelow100MillionBytes:runtimeEvidence.bytes<100_000_000,
    recommendedDelivery:external?'external-gltf':'embedded-glb',external,wroteCanonicalAssetAutomatically:false,outputDirectory:outDir,completedAt:new Date().toISOString()};
  const reportFile=path.join(outDir,'Data_LodRuntimePackageV13.json');writeAtomic(reportFile,Buffer.from(JSON.stringify(report,null,2)+'\n'));
  console.log(JSON.stringify({stage:'LodV13RuntimePackaged',file:outputFile,bytes:runtimeEvidence.bytes,totalTriangles:total,triangleBudget:LIMIT,external:!!external,report:reportFile}));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=n=>args.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
  if(args.includes('--help'))console.log('node Script_SichuanLodPackageV13.mjs raw.glb --out=<explicit new directory> [--bake=<Data_Lod40kPbrBakeV13.json>] [--name=<runtime.glb>] [--external]');
  else{const raw=args.find(a=>!a.startsWith('--'))??option('source'),out=option('out');if(!raw||!out){console.error('Raw GLB and explicit --out are required');process.exitCode=2;}
    else try{await PackageSichuanLodV13(raw,option('bake')??path.join(path.dirname(path.resolve(raw)),'Data_Lod40kPbrBakeV13.json'),out,{name:option('name')??null,forceExternal:args.includes('--external')});}catch(e){console.error(e.stack??String(e));process.exitCode=1;}}
}
