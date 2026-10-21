// Package full-resolution QualityV12 PBR for runtime delivery. No Blender,
// source mutation, image resizing, mesh reduction, or implicit canonical copy.
// node <this.mjs> raw.glb --out=<new directory> [--bake=<report.json>]
//   [--name=Model_SichuanQualityPbrV12.glb] [--external]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const GENERATOR='SichuanQualityRuntimePackageV12',RESOLUTION=4096;
const EXTERNAL_THRESHOLD=95_000_000,FILE_LIMIT=100_000_000;
const PARTS=['Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireTrue=(ok,message)=>{if(!ok)throw Error(message);};
const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pad4=size=>(4-size%4)%4;

async function fileEvidence(file){
  const sha=createHash('sha256');for await(const block of fs.createReadStream(file,{highWaterMark:1024*1024}))sha.update(block);
  return {path:path.resolve(file),bytes:fs.statSync(file).size,sha256:sha.digest('hex')};
}
function loadSharp(){
  const repository=fileURLToPath(new URL('../../',import.meta.url));
  for(const anchor of [path.join(repository,'Taierzhuang1938/package.json'),path.join(repository,'package.json'),
      path.join(process.env.QUALITY_QA_NODE_MODULES??'C:/Users/Bentl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','Resolve.cjs')]){
    try{const require=createRequire(anchor),resolved=require.resolve('sharp');return {sharp:require(resolved),resolved};}catch{}
  }
  throw Error('No installed project/bundled sharp was found; no dependency installation was attempted');
}
function readGlb(file){
  const bytes=fs.readFileSync(file);
  requireTrue(bytes.toString('ascii',0,4)==='glTF'&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'Expected a complete GLB 2 input');
  let document,binary,binStart,at=12;
  while(at<bytes.length){const length=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4);at+=8;
    requireTrue(at+length<=bytes.length,'Input GLB chunk exceeds file');
    if(type===0x4e4f534a)document=JSON.parse(bytes.toString('utf8',at,at+length).replace(/[\0 ]+$/,''));
    if(type===0x004e4942){binary=bytes.subarray(at,at+length);binStart=at;}at+=length;
  }
  requireTrue(document?.asset?.version==='2.0'&&binary&&document.buffers?.length===1&&!document.buffers[0].uri,'Expected one embedded GLB buffer');
  return {bytes,document,binary,binStart};
}
function viewBytes(source,id){
  const view=source.document.bufferViews[id],start=view.byteOffset??0;
  requireTrue(view.buffer===0&&Number.isInteger(view.byteLength)&&view.byteLength>0&&start>=0&&start+view.byteLength<=source.binary.length,'Invalid source bufferView '+id);
  return source.binary.subarray(start,start+view.byteLength);
}
function triangleCounts(g){
  const byPart=Object.fromEntries(PARTS.map(p=>[p,0])),seen=new Set();
  function walk(id,owner){requireTrue(!seen.has(id),'Repeated source scene node');seen.add(id);const node=g.nodes[id];if(PARTS.includes(node.name))owner=node.name;
    if(node.mesh!==undefined){requireTrue(PARTS.includes(owner),'Mesh is outside a controlled Quality part');for(const p of g.meshes[node.mesh].primitives){
      requireTrue((p.mode??4)===4,'Runtime packaging accepts triangle primitives');const count=g.accessors[p.indices??p.attributes.POSITION].count;
      requireTrue(count%3===0,'Invalid source triangle count');byPart[owner]+=count/3;
    }}for(const child of node.children??[])walk(child,owner);
  }
  const roots=g.scenes[g.scene??0].nodes;requireTrue(roots.length===1&&g.nodes[roots[0]].name==='Pack_Root','Source must contain one Pack_Root');walk(roots[0],null);
  requireTrue(PARTS.every(p=>byPart[p]>0),'Source is not the complete five-part Quality asset');return byPart;
}
function geometryAccessors(g){
  const ids=new Set();for(const a of g.accessors??[]){if(a.bufferView!==undefined)ids.add(a.bufferView);if(a.sparse){ids.add(a.sparse.indices.bufferView);ids.add(a.sparse.values.bufferView);}}return ids;
}
function geometryEvidence(source,ids){
  const digest=createHash('sha256'),views=[];
  for(const id of ids){const bytes=viewBytes(source,id);digest.update(bytes);views.push({bufferView:id,bytes:bytes.length,sha256:hash(bytes)});}
  return {orderedNonImageViewPayloadSha256:digest.digest('hex'),bytes:views.reduce((n,v)=>n+v.bytes,0),views};
}
function imageFiles(g){
  const used=new Set();return g.images.map((image,id)=>{
    let stem=(image.name??`Texture_QualityRuntimeV12_${id}`).replace(/\.(?:png|webp)$/i,'').replace(/[^A-Za-z0-9_\-]/g,'_');
    if(!stem.startsWith('Texture_'))stem='Texture_'+stem;
    let name=stem+'.webp',number=1;while(used.has(name.toLowerCase()))name=`${stem}_${number++}.webp`;used.add(name.toLowerCase());return name;
  });
}
function setWebpTextureReferences(g){
  for(const texture of g.textures??[]){requireTrue(Number.isInteger(texture.source),'Raw texture lacks its standard source image');
    texture.extensions={...(texture.extensions??{}),EXT_texture_webp:{source:texture.source}};delete texture.source;
  }
  g.extensionsUsed=[...new Set([...(g.extensionsUsed??[]),'EXT_texture_webp'])];
  g.extensionsRequired=[...new Set([...(g.extensionsRequired??[]),'EXT_texture_webp'])];
}
function writeAtomic(file,bytes){const temporary=file+'.tmp';fs.writeFileSync(temporary,bytes);fs.renameSync(temporary,file);}
function writeGlb(file,g,payloads){
  let length=0;
  for(let id=0;id<payloads.length;id++){const bytes=payloads[id];g.bufferViews[id]={...g.bufferViews[id],buffer:0,byteOffset:length,byteLength:bytes.length};length+=bytes.length+pad4(bytes.length);}
  g.buffers=[{byteLength:length}];
  const json=Buffer.from(JSON.stringify(g)),jsonPad=pad4(json.length),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
  const total=12+8+json.length+jsonPad+8+length;requireTrue(total<=0xffffffff,'Runtime GLB exceeds the GLB 32-bit container limit');
  header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);header.writeUInt32LE(json.length+jsonPad,12);header.writeUInt32LE(0x4e4f534a,16);
  binHeader.writeUInt32LE(length,0);binHeader.writeUInt32LE(0x004e4942,4);
  const temporary=file+'.tmp',fd=fs.openSync(temporary,'w');
  try{fs.writeSync(fd,header);fs.writeSync(fd,json);if(jsonPad)fs.writeSync(fd,Buffer.alloc(jsonPad,32));fs.writeSync(fd,binHeader);
    for(const bytes of payloads){fs.writeSync(fd,bytes);const padding=pad4(bytes.length);if(padding)fs.writeSync(fd,Buffer.alloc(padding));}
  }finally{fs.closeSync(fd);}fs.renameSync(temporary,file);
  return {jsonBytes:json.length,binStart:20+json.length+jsonPad+8,binBytes:length,totalBytes:total};
}
function hashFileRanges(file,ranges){
  const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024),all=createHash('sha256'),views=[];
  try{for(const range of ranges){const sha=createHash('sha256');let remaining=range.bytes,offset=range.offset;
    while(remaining){const size=Math.min(buffer.length,remaining),read=fs.readSync(fd,buffer,0,size,offset);requireTrue(read===size,'Truncated actual output geometry view');const bytes=buffer.subarray(0,size);sha.update(bytes);all.update(bytes);remaining-=size;offset+=size;}
    views.push({bufferView:range.bufferView,bytes:range.bytes,sha256:sha.digest('hex')});
  }}finally{fs.closeSync(fd);}return {orderedNonImageViewPayloadSha256:all.digest('hex'),views};
}
function remapViewReferences(value,map){
  if(Array.isArray(value)){for(const item of value)remapViewReferences(item,map);return;}
  if(!value||typeof value!=='object')return;
  for(const [key,item]of Object.entries(value)){
    if(key==='bufferView'&&Number.isInteger(item)){requireTrue(map.has(item),'External JSON still references a stripped image view');value[key]=map.get(item);}
    else remapViewReferences(item,map);
  }
}
async function externalPackage(outDir,stem,runtimeDoc,source,geometryIds,webps,names,expectedGeometry){
  const g=clone(runtimeDoc),viewMap=new Map(),views=[],chunks=[];let chunk={payloads:[],bytes:0,sourceViews:[]};chunks.push(chunk);
  for(const oldId of geometryIds){const bytes=viewBytes(source,oldId),padded=bytes.length+pad4(bytes.length);
    requireTrue(padded<=EXTERNAL_THRESHOLD,'One geometry bufferView exceeds the safe per-file size and cannot be split without changing accessor layout');
    if(chunk.bytes+padded>EXTERNAL_THRESHOLD&&chunk.payloads.length){chunk={payloads:[],bytes:0,sourceViews:[]};chunks.push(chunk);}
    viewMap.set(oldId,views.length);views.push({...source.document.bufferViews[oldId],buffer:chunks.length-1,byteOffset:chunk.bytes,byteLength:bytes.length});
    chunk.sourceViews.push({oldId,newId:views.length-1,offset:chunk.bytes,bytes:bytes.length});chunk.payloads.push(bytes);chunk.bytes+=padded;
  }
  // Remove image view references first, then rebase only retained actual
  // geometry/accessor view references. Mesh/accessor indices are unchanged.
  for(let id=0;id<g.images.length;id++){delete g.images[id].bufferView;g.images[id].uri=names[id];g.images[id].mimeType='image/webp';}
  g.bufferViews=views;remapViewReferences(g,viewMap);
  const buffers=[],files=[];
  for(let i=0;i<chunks.length;i++){
    const name=stem+'_Geometry'+(chunks.length>1?String(i+1).padStart(2,'0'):'')+'.bin',file=path.join(outDir,name),fd=fs.openSync(file+'.tmp','w');
    try{for(const bytes of chunks[i].payloads){fs.writeSync(fd,bytes);const padding=pad4(bytes.length);if(padding)fs.writeSync(fd,Buffer.alloc(padding));}}finally{fs.closeSync(fd);}fs.renameSync(file+'.tmp',file);
    buffers.push({uri:name,byteLength:chunks[i].bytes});files.push(await fileEvidence(file));
  }
  g.buffers=buffers;
  for(let id=0;id<webps.length;id++){const file=path.join(outDir,names[id]);writeAtomic(file,webps[id]);files.push(await fileEvidence(file));}
  const gltfFile=path.join(outDir,stem+'.gltf');writeAtomic(gltfFile,Buffer.from(JSON.stringify(g)));files.unshift(await fileEvidence(gltfFile));
  requireTrue(files.every(file=>file.bytes<FILE_LIMIT),'An external runtime file reaches the 100 MB safety limit');
  requireTrue(same(g.meshes,source.document.meshes)&&same(g.nodes,source.document.nodes),'External package changed mesh indices or node hierarchy');
  const sourceAccessors=clone(source.document.accessors);remapViewReferences(sourceAccessors,viewMap);
  requireTrue(same(g.accessors,sourceAccessors),'External accessor rebasing changed counts or byte/index formats');
  const all=createHash('sha256'),actualViews=[];
  // Hash output files in original geometry-view order, independently of BIN
  // boundaries or alignment padding. Only geometry and zero alignment bytes
  // are present in the external BINs; every image uses its own .webp URI.
  for(let i=0;i<chunks.length;i++){
    const ranges=chunks[i].sourceViews.map(v=>({bufferView:v.oldId,offset:v.offset,bytes:v.bytes}));
    const proof=hashFileRanges(path.join(outDir,buffers[i].uri),ranges);actualViews.push(...proof.views);
    const fd=fs.openSync(path.join(outDir,buffers[i].uri),'r'),scratch=Buffer.alloc(1024*1024);
    try{for(const range of ranges){let remaining=range.bytes,offset=range.offset;while(remaining){const size=Math.min(scratch.length,remaining);requireTrue(fs.readSync(fd,scratch,0,size,offset)===size,'External BIN read failed');all.update(scratch.subarray(0,size));remaining-=size;offset+=size;}}}finally{fs.closeSync(fd);}
  }
  requireTrue(same(actualViews,expectedGeometry.views)&&all.digest('hex')===expectedGeometry.orderedNonImageViewPayloadSha256,'Actual external geometry bytes differ from source');
  return {gltf:files[0],files,geometryOnlyBuffers:buffers,geometryBufferCount:buffers.length,
    imageFiles:webps.length,everyFileBelow100MillionBytes:true,sourceImageBufferViewsStripped:true,
    accessorIdsAndCountsUnchanged:true,accessorBufferViewsExplicitlyRebased:true,
    geometryViewPayloads:actualViews,orderedGeometryPayloadSha256:expectedGeometry.orderedNonImageViewPayloadSha256};
}

export async function PackageQualityRuntimeV12(rawFile,bakeFile,outDir,{name=null,forceExternal=false}={}){
  rawFile=path.resolve(rawFile);bakeFile=path.resolve(bakeFile);outDir=path.resolve(outDir);
  requireTrue(fs.existsSync(rawFile)&&fs.existsSync(bakeFile),'Raw GLB and its actual bake report are required');
  const outputName=name??path.basename(rawFile);requireTrue(path.basename(outputName)===outputName&&outputName.toLowerCase().endsWith('.glb'),'Runtime name must be a GLB basename');
  const outputFile=path.join(outDir,outputName);requireTrue(outputFile.toLowerCase()!==rawFile.toLowerCase(),'Never overwrite the diagnostic raw GLB');
  const bakeBytes=fs.readFileSync(bakeFile),bake=JSON.parse(bakeBytes.toString('utf8').replace(/^\uFEFF/,''));
  requireTrue(bake.generator==='SichuanQualityPbrV12'&&bake.partialProbe===false&&same(bake.resolutionPerPart,[RESOLUTION,RESOLUTION]),'Packaging requires the complete actual five-part 4k PBR bake');
  const source=readGlb(rawFile),rawSha=hash(source.bytes),g=source.document,counts=triangleCounts(g);
  requireTrue(rawSha===bake.glb.sha256&&source.bytes.length===bake.glb.bytes,'Raw GLB does not match its actual bake evidence');
  requireTrue(same(counts,bake.actualGlb.byPart),'Raw GLB triangle counts differ from its actual five-part bake');
  requireTrue(g.images?.length===15,'Expected the full five-part Base/Normal/ORM set of fifteen source images');
  requireTrue(!(g.extensionsRequired??[]).some(e=>['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(e)),'Compressed geometry is outside this byte-preserving native packaging route');
  requireTrue((g.materials??[]).every(m=>(m.alphaMode??'OPAQUE')==='OPAQUE'),'Alpha may only be removed when every material is OPAQUE');
  const imageViewIds=new Set(g.images.map(image=>image.bufferView));
  requireTrue(!imageViewIds.has(undefined)&&imageViewIds.size===g.images.length,'Raw images must occupy independent embedded bufferViews');
  requireTrue([...geometryAccessors(g)].every(id=>!imageViewIds.has(id)),'An image bufferView is also referenced by geometry');
  const geometryIds=g.bufferViews.flatMap((view,id)=>imageViewIds.has(id)?[]:[id]),before=geometryEvidence(source,geometryIds);
  const {sharp,resolved}=loadSharp();sharp.cache({memory:32});
  const runtime=clone(g),webps=[],images=[],replacementViews=new Map(),names=imageFiles(g);
  fs.mkdirSync(outDir,{recursive:true});
  for(let id=0;id<g.images.length;id++){
    const image=g.images[id],raw=viewBytes(source,image.bufferView);
    requireTrue(raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Raw diagnostic image is not PNG: '+image.name);
    const rawWidth=raw.readUInt32BE(16),rawHeight=raw.readUInt32BE(20),rawBitDepth=raw[24];
    requireTrue(rawWidth===RESOLUTION&&rawHeight===RESOLUTION,'No resolution change is permitted: '+image.name);
    // Decode once to the intended runtime RGB8 precision, then encode THAT
    // exact buffer. There is no resize, colour tint, normal adjustment, lossy
    // quality step, or mutation of the original diagnostic PNG.
    const rgb=await sharp(raw).removeAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
    requireTrue(rgb.info.width===RESOLUTION&&rgb.info.height===RESOLUTION&&rgb.info.channels===3,'Source RGB8 decode changed image dimensions/channels');
    const rgbSha=hash(rgb.data);
    const cacheFile=path.join(outDir,names[id]);
    let webp,decoded,cacheReused=false;
    if(fs.existsSync(cacheFile)){
      const candidate=fs.readFileSync(cacheFile);
      try{
        const pixels=await sharp(candidate).removeAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
        if(pixels.info.width===RESOLUTION&&pixels.info.height===RESOLUTION&&pixels.info.channels===3&&rgb.data.equals(pixels.data)){
          webp=candidate;decoded=pixels;cacheReused=true;
        }
      }catch{/* A cache entry is never accepted without actual RGB8 equality. */}
    }
    if(!webp){
      webp=await sharp(rgb.data,{raw:{width:RESOLUTION,height:RESOLUTION,channels:3}}).webp({lossless:true,nearLossless:false,effort:4}).toBuffer();
      decoded=await sharp(webp).removeAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
    }
    const decodedSha=hash(decoded.data);
    requireTrue(decoded.info.width===RESOLUTION&&decoded.info.height===RESOLUTION&&decoded.info.channels===3&&rgbSha===decodedSha&&rgb.data.equals(decoded.data),'WebP RGB8 roundtrip is not byte-exact: '+image.name);
    if(!cacheReused)writeAtomic(cacheFile,webp);
    replacementViews.set(image.bufferView,webp);webps.push(webp);
    runtime.images[id]={...runtime.images[id],mimeType:'image/webp'};delete runtime.images[id].uri;
    images.push({image:id,name:image.name,bufferView:image.bufferView,sourcePngBytes:raw.length,sourcePngSha256:hash(raw),sourcePngBitDepth:rawBitDepth,
      width:RESOLUTION,height:RESOLUTION,runtimeChannels:3,runtimeBitDepth:8,alphaRemoved:true,allUsingMaterialsOpaque:true,
      sourceDecodedRgb8Bytes:rgb.data.length,sourceDecodedRgb8Sha256:rgbSha,webpBytes:webp.length,webpSha256:hash(webp),
      webpDecodedRgb8Sha256:decodedSha,webpDecodedRgb8Bytes:decoded.data.length,rgb8RoundtripExact:true,
      precisionPolicy:'Intentional source PNG 16-bit to RGB8 decode/quantisation; subsequent lossless WebP roundtrip preserves every decoded RGB8 byte; no 16-bit equivalence claim',
      externalFilename:names[id],cacheReused});
    console.log(JSON.stringify({stage:'QualityRuntimeImageEncoded',image:id+1,of:g.images.length,name:image.name,pngBytes:raw.length,webpBytes:webp.length,rgb8RoundtripExact:true,cacheReused}));
  }
  setWebpTextureReferences(runtime);
  const payloads=g.bufferViews.map((view,id)=>replacementViews.get(id)??viewBytes(source,id));
  const layout=writeGlb(outputFile,runtime,payloads);
  requireTrue(same(runtime.meshes,g.meshes)&&same(runtime.nodes,g.nodes)&&same(runtime.scenes,g.scenes)&&same(runtime.accessors,g.accessors),'Runtime packaging changed geometry/index/accessor/hierarchy JSON');
  const actual=hashFileRanges(outputFile,geometryIds.map(id=>({bufferView:id,offset:layout.binStart+(runtime.bufferViews[id].byteOffset??0),bytes:runtime.bufferViews[id].byteLength})));
  requireTrue(same(before.views,actual.views)&&before.orderedNonImageViewPayloadSha256===actual.orderedNonImageViewPayloadSha256,'Actual runtime GLB geometry bytes differ from source');
  requireTrue(runtime.images.every(i=>i.mimeType==='image/webp'&&!i.uri)&&runtime.textures.every(t=>t.source===undefined&&Number.isInteger(t.extensions?.EXT_texture_webp?.source)),'Runtime GLB retained a standard PNG fallback or missing WebP source');
  const runtimeEvidence=await fileEvidence(outputFile),stem=path.basename(outputName,'.glb');
  let external=null;if(forceExternal||runtimeEvidence.bytes>EXTERNAL_THRESHOLD)external=await externalPackage(outDir,stem,runtime,source,geometryIds,webps,names,before);
  const rawAfter=await fileEvidence(rawFile);requireTrue(rawAfter.sha256===rawSha&&rawAfter.bytes===source.bytes.length,'Diagnostic raw GLB changed during packaging');
  const report={generator:GENERATOR,sourceRawGlb:{path:rawFile,bytes:source.bytes.length,sha256:rawSha},
    sourceBakeReport:{path:bakeFile,bytes:bakeBytes.length,sha256:hash(bakeBytes)},runtimeGlb:runtimeEvidence,sharpModule:resolved,
    resolutionPerPart:[RESOLUTION,RESOLUTION],partTrianglesBefore:counts,partTrianglesAfter:triangleCounts(runtime),
    totalTriangles:Object.values(counts).reduce((a,b)=>a+b,0),geometryReduced:false,geometryAttributesOrIndicesRewritten:false,
    geometryAccessorIdsCountsAndFormatsUnchanged:true,geometryBufferViewIdsUnchangedInGlb:true,
    geometryViewEvidenceBefore:before,geometryViewEvidenceAfter:actual,geometryBinaryPayloadSha256:before.orderedNonImageViewPayloadSha256,
    geometryHashMeaning:'Concatenation, in original bufferView order, of every non-image view payload; alignment padding and image payloads excluded',
    imageCount:images.length,images,sourceDiagnosticPngsModified:false,sourceDiagnosticGlbUnchanged:true,
    imageResolutionChanged:false,texturePrecision:'Source 16-bit PNG diagnostics intentionally quantised to RGB8; WebP lossless relative to that exact RGB8 buffer',
    allRgb8RoundtripsExact:images.every(i=>i.rgb8RoundtripExact),textureExtension:'EXT_texture_webp',extensionRequired:true,pngFallback:false,
    externalThresholdBytes:EXTERNAL_THRESHOLD,individualFileSafetyLimitBytes:FILE_LIMIT,
    runtimeGlbBelow100MillionBytes:runtimeEvidence.bytes<FILE_LIMIT,recommendedDelivery:external?'external-gltf':'embedded-glb',external,
    wroteCanonicalAssetAutomatically:false,outputDirectory:outDir,completedAt:new Date().toISOString()};
  const reportFile=path.join(outDir,'Data_QualityRuntimePackageV12.json');writeAtomic(reportFile,Buffer.from(JSON.stringify(report,null,2)+'\n'));
  console.log(JSON.stringify({stage:'QualityRuntimePackaged',runtimeGlb:runtimeEvidence.path,bytes:runtimeEvidence.bytes,totalTriangles:report.totalTriangles,images:images.length,external:!!external,recommendedDelivery:report.recommendedDelivery,report:reportFile}));
  return report;
}

// Pure packaging utilities shared by the separately versioned 40k package.
// Exporting these changes no V12 execution, schema, or saved evidence.
export {fileEvidence,loadSharp,readGlb,viewBytes,triangleCounts,geometryAccessors,
  geometryEvidence,imageFiles,writeAtomic,writeGlb,hashFileRanges,externalPackage};

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
  if(args.includes('--help'))console.log('node Script_SichuanQualityPackageV12.mjs raw.glb --out=<explicit new directory> [--bake=<Data_QualityPbrBakeV12.json>] [--name=<runtime.glb>] [--external]');
  else{const raw=args.find(a=>!a.startsWith('--'))??option('source'),out=option('out');
    if(!raw||!out){console.error('Both the raw GLB and explicit --out directory are required. Use --help.');process.exitCode=2;}
    else try{await PackageQualityRuntimeV12(raw,option('bake')??path.join(path.dirname(path.resolve(raw)),'Data_QualityPbrBakeV12.json'),out,{name:option('name')??null,forceExternal:args.includes('--external')});}
    catch(error){console.error(error.stack??String(error));process.exitCode=1;}
  }
}
