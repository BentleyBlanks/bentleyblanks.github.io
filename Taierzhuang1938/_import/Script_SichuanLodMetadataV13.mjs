// Explicit, gated publication of the <=40000-triangle V13 delivery metadata.
// Nothing executes on import. --dry-run performs the same evidence checks
// without changing either formal JSON. Screenshots/large diagnostic reports
// remain local; this script never copies them into the asset directory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const project=path.join(repository,'Taierzhuang1938'),assetDir=path.join(project,'Model/SichuanBlanketPack');
const parts=['Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'],triangleBudget=40000;
const projectedMode='projected-high-to-low-new-uv',inheritedMode='inherited-high-atlas-normal-transfer';
const requireTrue=(ok,message)=>{if(!ok)throw Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const slash=p=>p.split(path.sep).join('/');
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameCounts=(a,b)=>a&&b&&parts.every(p=>a[p]===b[p]);
const projectPath=file=>slash(path.relative(project,file));
const contained=(folder,file)=>{const rel=path.relative(folder,file);return rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
async function fileEvidence(file){
  requireTrue(fs.existsSync(file),'Evidence file is missing: '+file);
  const sha=createHash('sha256');for await(const block of fs.createReadStream(file,{highWaterMark:1024*1024}))sha.update(block);
  return {path:path.resolve(file),bytes:fs.statSync(file).size,sha256:sha.digest('hex')};
}
function readReport(file){const bytes=fs.readFileSync(file);return {file:path.resolve(file),sha256:hash(bytes),bytes:bytes.length,value:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))};}
function passed(report,label){requireTrue(report.passed===true&&Array.isArray(report.checks)&&report.checks.length>0&&report.checks.every(c=>c.ok===true),label+' has not passed all actual checks');}
function readDocument(file){
  if(path.extname(file).toLowerCase()==='.gltf')return {json:JSON.parse(fs.readFileSync(file,'utf8')),binStart:null,format:'gltf'};
  const fd=fs.openSync(file,'r');try{const header=Buffer.alloc(20);fs.readSync(fd,header,0,20,0);requireTrue(header.toString('ascii',0,4)==='glTF'&&header.readUInt32LE(4)===2&&header.readUInt32LE(8)===fs.fstatSync(fd).size,'Canonical file is not a valid GLB 2');
    const length=header.readUInt32LE(12);requireTrue(header.readUInt32LE(16)===0x4e4f534a&&length<20*1024*1024,'Canonical GLB JSON header is invalid');const text=Buffer.alloc(length);requireTrue(fs.readSync(fd,text,0,length,20)===length,'Truncated canonical GLB JSON');
    const binary=Buffer.alloc(8);requireTrue(fs.readSync(fd,binary,0,8,20+length)===8&&binary.readUInt32LE(4)===0x004e4942,'Canonical GLB lacks its embedded BIN');
    return {json:JSON.parse(text.toString('utf8').replace(/[\0 ]+$/,'')),binStart:28+length,format:'glb'};
  }finally{fs.closeSync(fd);}
}
function range(file,start,length){const fd=fs.openSync(file,'r'),bytes=Buffer.alloc(length);try{requireTrue(fs.readSync(fd,bytes,0,length,start)===length,'Truncated embedded image');return bytes;}finally{fs.closeSync(fd);}}
function webpFacts(bytes){
  requireTrue(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','Canonical runtime image is not WebP');
  let width,height,lossless=false;
  for(let at=12;at+8<=bytes.length;){const kind=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),body=at+8;requireTrue(body+length<=bytes.length,'Truncated WebP chunk');
    if(kind==='VP8X'){width=bytes.readUIntLE(body+4,3)+1;height=bytes.readUIntLE(body+7,3)+1;}
    if(kind==='VP8L'){requireTrue(bytes[body]===0x2f,'Invalid lossless WebP header');const packed=bytes.readUInt32LE(body+1);width??=1+(packed&0x3fff);height??=1+((packed>>>14)&0x3fff);lossless=true;}
    requireTrue(kind!=='VP8 ','A runtime texture uses lossy WebP');at=body+length+(length&1);
  }
  requireTrue(lossless&&width===4096&&height===4096,'Every runtime texture must be lossless 4096-square WebP');return {width,height,lossless};
}
function countAndMap(g){
  const byPart=Object.fromEntries(parts.map(p=>[p,0])),images=new Map(),seen=new Set();
  requireTrue(g.asset?.version==='2.0'&&g.scenes?.length===1,'Canonical delivery requires one glTF 2 scene');
  requireTrue(g.extensionsRequired?.includes('EXT_texture_webp')&&g.extensionsUsed?.includes('EXT_texture_webp'),'The actual runtime must require EXT_texture_webp');
  const roots=g.scenes[g.scene??0].nodes,root=g.nodes[roots[0]];
  requireTrue(roots.length===1&&root.name==='Pack_Root','Canonical delivery requires one Pack_Root');
  for(const p of parts)requireTrue(g.nodes.filter(n=>n.name===p).length===1&&root.children.some(i=>g.nodes[i].name===p),'Canonical part is not an independent direct root: '+p);
  function image(info,part,channel){requireTrue(info&&(info.texCoord??0)===0&&!info.extensions?.KHR_texture_transform,'Material does not use direct QualityUV/TEXCOORD_0');
    const texture=g.textures[info.index],id=texture.extensions?.EXT_texture_webp?.source;requireTrue(texture.source===undefined&&Number.isInteger(id)&&g.images[id]?.mimeType==='image/webp','Runtime material retained a PNG fallback');
    const key=part+':'+channel;requireTrue(!images.has(key)||images.get(key)===id,'One part has multiple incompatible '+channel+' atlases');images.set(key,id);return id;
  }
  function walk(id,owner){requireTrue(!seen.has(id),'Repeated canonical scene node');seen.add(id);const n=g.nodes[id];if(parts.includes(n.name))owner=n.name;
    if(n.mesh!==undefined){requireTrue(parts.includes(owner),'Canonical geometry lies outside a controlled part');for(const p of g.meshes[n.mesh].primitives){requireTrue((p.mode??4)===4,'Non-triangle canonical primitive');const count=g.accessors[p.indices??p.attributes.POSITION].count;requireTrue(count%3===0,'Invalid triangle count');byPart[owner]+=count/3;
      const m=g.materials[p.material],pbr=m.pbrMetallicRoughness;requireTrue((m.alphaMode??'OPAQUE')==='OPAQUE','Alpha was removed from a nonopaque material');
      image(pbr.baseColorTexture,owner,'Base');image(m.normalTexture,owner,'Normal');requireTrue(image(pbr.metallicRoughnessTexture,owner,'Orm')===image(m.occlusionTexture,owner,'Orm'),'Runtime AO/roughness/metallic do not share ORM');
    }}for(const child of n.children??[])walk(child,owner);
  }
  walk(roots[0],null);requireTrue(g.images.length===15&&images.size===15&&new Set(images.values()).size===15,'Canonical runtime does not have the fifteen independent part/channel maps');return {byPart,images};
}
function atomicPair(writes){
  const originals=writes.map(w=>fs.existsSync(w.file)?fs.readFileSync(w.file):null),temporary=writes.map(w=>w.file+'.LodV13.tmp');
  try{for(let i=0;i<writes.length;i++)fs.writeFileSync(temporary[i],writes[i].bytes);for(let i=0;i<writes.length;i++)fs.renameSync(temporary[i],writes[i].file);}
  catch(error){for(let i=0;i<writes.length;i++){if(originals[i])fs.writeFileSync(writes[i].file,originals[i]);else if(fs.existsSync(writes[i].file))fs.rmSync(writes[i].file);if(fs.existsSync(temporary[i]))fs.rmSync(temporary[i]);}throw error;}
}

export async function WriteLodMetadataV13(inputs,{dryRun=false}={}){
  for(const key of ['bake','package','audit','browser','model','runtimeGlb','lowBlend'])requireTrue(typeof inputs[key]==='string'&&inputs[key],`Explicit ${key} input is required`);
  const model=path.resolve(inputs.model),runtimeGlb=path.resolve(inputs.runtimeGlb),lowBlend=path.resolve(inputs.lowBlend);
  requireTrue(contained(assetDir,model),'Model must already be in this worktree\'s canonical SichuanBlanketPack asset directory');
  requireTrue(path.extname(runtimeGlb).toLowerCase()==='.glb'&&!contained(repository,runtimeGlb),'The retained runtime GLB must be the explicit external/OneDrive file');
  const br=readReport(inputs.bake),pr=readReport(inputs.package),ar=readReport(inputs.audit),qr=readReport(inputs.browser);
  const bake=br.value,pack=pr.value,audit=ar.value,browser=qr.value;
  requireTrue(bake.generator==='SichuanLod40kPbrV13'&&bake.partialProbe===false&&same(bake.resolutionPerPart,[4096,4096]),'Bake is not the complete 4k V13 LOD export');
  const materialBakeMode=bake.materialBakeMode??inheritedMode,isProjected=materialBakeMode===projectedMode;
  requireTrue(isProjected||materialBakeMode===inheritedMode,'Unrecognised V13 material bake mode');
  passed(audit,'Raw V13 LOD audit');passed(browser,'Actual canonical browser QA');
  requireTrue(audit.probe!==true&&audit.partialProbe!==true&&audit.finalDeliveryStructurallyVerified!==false&&audit.sha256===bake.glb.sha256&&audit.bytes===bake.glb.bytes,'Raw audit is not bound to this full V13 export');
  requireTrue(pack.generator==='SichuanLod40kPbrV13'&&pack.reportType==='runtime-package'&&pack.sourceRawGlb?.sha256===bake.glb.sha256&&pack.sourceRawGlb?.bytes===bake.glb.bytes&&pack.sourceBakeReport?.sha256===br.sha256&&pack.sourceBakeReport?.bytes===br.bytes,'Runtime package is not bound to the exact raw V13 report');
  requireTrue(pack.rawGeometryPreserved===true&&pack.geometryReducedDuringPackaging===false&&pack.reductionAppliedBeforePackaging===true&&pack.geometryAttributesOrIndicesRewritten===false&&pack.geometryAccessorIdsCountsAndFormatsUnchanged===true&&same(pack.geometryViewEvidenceBefore?.views,pack.geometryViewEvidenceAfter?.views)&&pack.geometryViewEvidenceBefore?.orderedNonImageViewPayloadSha256===pack.geometryViewEvidenceAfter?.orderedNonImageViewPayloadSha256,'Runtime packaging does not preserve exact RAW V13 geometry bytes/accessor formats');
  requireTrue(pack.pngFallback===false&&pack.extensionRequired===true&&pack.allRgb8RoundtripsExact===true&&pack.images?.length===15&&pack.images.every(i=>i.rgb8RoundtripExact&&i.width===4096&&i.height===4096&&i.runtimeBitDepth===8&&i.sourceDecodedRgb8Sha256===i.webpDecodedRgb8Sha256),'Runtime texture precision/roundtrip/4k evidence is incomplete');
  requireTrue((pack.materialBakeMode??inheritedMode)===materialBakeMode&&pack.newV13NormalImageCount===5,'The package material mode or five new Normal maps disagree with the raw bake');
  if(isProjected)requireTrue(bake.originalHighAtlasBytesClaimedInherited===false&&pack.originalHighAtlasBytesClaimedInherited===false&&pack.baseOrmPreservedFromHighRuntime===false&&pack.projectedPbrImageCount===15&&pack.allRawImagesMatchProjectionOutputs===true,'Projected PBR must prove fifteen new actual maps and disclaim high-atlas pixel inheritance');
  else requireTrue(pack.baseOrmPreservedFromHighRuntime===true,'The ten V12 Base/ORM images lack exact high-runtime provenance');
  const total=Object.values(bake.actualGlb.byPart).reduce((a,b)=>a+b,0);
  const audited=p=>audit.parts?.[p]?.triangles??audit.byPart?.[p]??audit.actualGlb?.byPart?.[p];
  requireTrue(total>0&&total<=triangleBudget&&audit.totalTriangles===total&&browser.expectedTriangles===total&&browser.triangleBudget===triangleBudget&&parts.every(p=>audited(p)===bake.actualGlb.byPart[p]&&browser.expectedByPart[p]===bake.actualGlb.byPart[p]),'Actual V13 raw/package/browser counts disagree or exceed 40000');
  requireTrue(pack.totalTriangles===total&&pack.sourceHighRuntimeTotalTriangles>total&&sameCounts(pack.partTrianglesBefore,bake.actualGlb.byPart)&&sameCounts(pack.partTrianglesAfter,bake.actualGlb.byPart),'Runtime packaging triangle inventories disagree with raw V13 or its higher-detail reference');
  const sourceBlend=await fileEvidence(bake.sourceBlend.path);requireTrue(sourceBlend.bytes===bake.sourceBlend.bytes&&sourceBlend.sha256===bake.sourceBlend.sha256,'Frozen saved source Blend no longer matches bake provenance');
  requireTrue(bake.sourceHighRuntime?.path,'V13 report lacks its retained high runtime');
  const highRuntime=await fileEvidence(bake.sourceHighRuntime.path);requireTrue(highRuntime.bytes===bake.sourceHighRuntime.bytes&&highRuntime.sha256===bake.sourceHighRuntime.sha256&&pack.sourceHighRuntime?.sha256===highRuntime.sha256,'Retained high runtime differs from V13 bake/package provenance');
  let projection=null,projectionOutputs=new Map();
  if(isProjected){
    requireTrue(bake.projectionBake?.path,'Projected bake lacks its independent actual report');
    const prj=readReport(bake.projectionBake.path),value=prj.value;
    requireTrue(prj.sha256===bake.projectionBake.sha256&&prj.bytes===bake.projectionBake.bytes&&pack.projectionBake?.sha256===prj.sha256&&pack.projectionBake?.bytes===prj.bytes,'Projection report changed or differs from the runtime package');
    requireTrue(value.generator==='SichuanLodProjectionBakeV13'&&value.partialProbe===false&&value.selectedToActive===true&&value.rayProjectionUsed===true&&same(value.resolutionPerPart,[4096,4096])&&value.sourceHighRuntime?.sha256===highRuntime.sha256&&value.sourceHighRuntime?.bytes===highRuntime.bytes&&value.sourceHighBlend?.sha256===sourceBlend.sha256&&value.sourceHighBlend?.bytes===sourceBlend.bytes&&Object.keys(value.atlases??{}).length===5,'Projection report is incomplete or does not use the retained actual high runtime/master');
    const high=value.objects?.filter(o=>o.kind==='High')??[],low=value.objects?.filter(o=>o.kind==='Low')??[];
    requireTrue(high.length>0&&low.length===(bake.objects??[]).length&&high.length+low.length===value.objects.length,'Projection report lacks the complete actual High/Low mesh inventory');
    requireTrue(high.every(o=>o.before&&same(o.before,o.after)),'Projection changed actual High mesh geometry/UVs');
    const lowIndex=new Map();
    for(const row of low){const name=row.originalName??row.sourceName??row.object,key=row.part+':'+name;requireTrue(name&&!lowIndex.has(key)&&row.beforeReunwrap?.geometryOnlySha256&&row.beforeReunwrap.geometryOnlySha256===row.afterReunwrap?.geometryOnlySha256&&row.before&&same(row.before,row.after),'Low re-unwrap changed geometry or projection changed the new atlas baseline: '+name);lowIndex.set(key,row);}
    for(const row of bake.objects??[]){const actual=lowIndex.get(row.part+':'+(row.sourceName??row.object));requireTrue(actual&&same(actual.before,row.sourceGeometryAndUvs)&&same(actual.after,row.sourceGeometryAndUvsAfterBake),'Raw export differs from actual Low projection mesh/new UV evidence: '+row.object);}
    for(const part of parts)for(const channel of ['Base','Normal','Orm']){
      const recorded=value.atlases[part]?.images?.[channel];requireTrue(recorded?.path,'Projection report lost '+part+' '+channel);
      const actual=await fileEvidence(recorded.path),runtime=pack.images.find(i=>i.part===part&&i.channel===channel);
      requireTrue(actual.bytes===recorded.bytes&&actual.sha256===recorded.sha256&&runtime?.sourceImageBytes===actual.bytes&&runtime?.sourceImageSha256===actual.sha256&&runtime?.projectionBakeSource?.sha256===actual.sha256&&runtime?.projectionBakeSource?.bytes===actual.bytes&&runtime.highRuntimeSource===null,'Actual projected source differs from the packaged raw GLB image: '+part+' '+channel);
      projectionOutputs.set(part+':'+channel,actual);
    }
    let nearestSurfaceFallback=null;
    if(value.nearestSurfaceFallback){
      const recorded=value.nearestSurfaceFallback;requireTrue(typeof recorded.path==='string'&&typeof recorded.generator==='string'&&recorded.generator,'Closest-high-surface fallback lacks its actual report path/generator');
      const actual=readReport(recorded.path);requireTrue(actual.bytes===recorded.bytes&&actual.sha256===recorded.sha256&&actual.value.generator===recorded.generator,'Closest-high-surface fallback report differs from its frozen evidence');
      nearestSurfaceFallback={path:actual.file,bytes:actual.bytes,sha256:actual.sha256,generator:actual.value.generator};
    }
    projection={path:prj.file,bytes:prj.bytes,sha256:prj.sha256,generator:value.generator,nearestSurfaceFallback,
      surfaceTransferMethod:nearestSurfaceFallback?'Selected rays with recorded closest-high-surface barycentric texture sampling for actual covered texels missed by rays; sampled high normals converted from High TBN to Low TBN.':'Selected-to-active ray projection onto new low UVs.'};
  }
  const lowSource=await fileEvidence(lowBlend),recordedLow=bake.sourceLowBlend??bake.lowBlend;
  requireTrue(recordedLow&&lowSource.sha256===recordedLow.sha256&&lowSource.bytes===recordedLow.bytes&&pack.sourceLowBlend?.sha256===lowSource.sha256,'Actual final low Blend differs from the exported/saved V13 source');
  const retainedGlb=await fileEvidence(runtimeGlb);requireTrue(retainedGlb.bytes===pack.runtimeGlb.bytes&&retainedGlb.sha256===pack.runtimeGlb.sha256,'Explicit retained runtime GLB differs from the package');
  const canonical=await fileEvidence(model),document=readDocument(model),g=document.json,{byPart,images:imageMap}=countAndMap(g);
  requireTrue(canonical.bytes<100_000_000,'Canonical model file reaches the per-file 100MB safety limit');
  requireTrue(sameCounts(byPart,bake.actualGlb.byPart),'Canonical file changed raw V13 triangle counts');
  const expectedModel=document.format==='gltf'?pack.external?.gltf:pack.runtimeGlb;
  requireTrue(canonical.sha256===expectedModel?.sha256&&canonical.bytes===expectedModel?.bytes,'Actual canonical model differs from runtime package evidence');
  requireTrue(samePath(browser.model,model)&&browser.assetSha256===canonical.sha256&&browser.assetBytes===canonical.bytes&&browser.browserStarted===true,'Browser QA did not load this actual canonical model');
  requireTrue(browser.states?.base?.totalTriangles===total&&browser.states?.base?.visibleTriangles===total&&browser.states?.restored?.visibleTriangles===total&&browser.checks.some(c=>c.id==='withdraw-jacket'&&c.ok)&&browser.checks.some(c=>c.id==='hide-mat'&&c.ok)&&browser.checks.some(c=>c.id==='hide-jacket'&&c.ok),'Actual browser optional-part/whole-garment interaction evidence is incomplete');
  const canonicalFiles=[{...canonical,path:projectPath(model),kind:'model'}],fileRecords=new Map();
  if(document.format==='gltf'){
    requireTrue(pack.external?.sourceImageBufferViewsStripped===true&&pack.external?.everyFileBelow100MillionBytes===true,'External package lacks geometry-only/file-size proof');
    requireTrue(pack.external?.accessorIdsAndCountsUnchanged===true&&pack.external?.accessorBufferViewsExplicitlyRebased===true&&same(pack.external?.geometryViewPayloads,pack.geometryViewEvidenceBefore.views)&&pack.external?.orderedGeometryPayloadSha256===pack.geometryViewEvidenceBefore.orderedNonImageViewPayloadSha256,'External geometry bytes/accessor rebasing differ from the raw native payloads');
    const recorded=new Map(pack.external.files.map(e=>[path.basename(e.path).toLowerCase(),e]));
    for(const [kind,records]of [['geometry',g.buffers],['image',g.images]])for(const record of records){
      requireTrue(typeof record.uri==='string'&&!/^[a-z]+:/i.test(record.uri)&&!/[?#]/.test(record.uri),'Canonical external URI must be a plain relative file');
      const file=path.resolve(path.dirname(model),decodeURIComponent(record.uri));requireTrue(contained(assetDir,file),'Canonical external file escaped its asset directory');
      const evidence=await fileEvidence(file),expected=recorded.get(path.basename(file).toLowerCase());
      requireTrue(expected&&evidence.sha256===expected.sha256&&evidence.bytes===expected.bytes&&evidence.bytes<100_000_000,'Canonical external file differs from package or reaches 100MB: '+file);
      const entry={...evidence,path:projectPath(file),kind};fileRecords.set(record.uri,{...entry,absolutePath:file});canonicalFiles.push(entry);
    }
  }else requireTrue(canonical.bytes<100_000_000,'Embedded canonical GLB reaches the per-file 100MB safety limit');
  for(const file of canonicalFiles){
    const actualPath=path.join(project,file.path),http=browser.browserAssets?.find(e=>e.status===200&&e.sha256===file.sha256&&e.bytes===file.bytes);
    requireTrue(http&&browser.httpResources?.some(e=>samePath(e.file,actualPath)&&e.sha256===file.sha256&&e.bytes===file.bytes),'Browser did not SHA-check an actual canonical HTTP resource: '+actualPath);
  }
  const textures=[];
  for(const part of parts)for(const channel of ['Base','Normal','Orm']){
    const id=imageMap.get(part+':'+channel),image=g.images[id],record=pack.images.find(i=>i.image===id);requireTrue(record,'Runtime image lacks a roundtrip record');
    let bytes,location;
    if(document.format==='gltf'){const entry=fileRecords.get(image.uri);requireTrue(entry,'Runtime WebP is missing from canonical files');bytes=fs.readFileSync(entry.absolutePath);location={path:entry.path};}
    else{requireTrue(Number.isInteger(image.bufferView),'Embedded runtime image lacks a bufferView');const view=g.bufferViews[image.bufferView];requireTrue(view.buffer===0,'Embedded image uses an unexpected buffer');bytes=range(model,document.binStart+(view.byteOffset??0),view.byteLength);location={embeddedIn:projectPath(model),imageIndex:id,bufferView:image.bufferView};}
    webpFacts(bytes);const sha256=hash(bytes);requireTrue(sha256===record.webpSha256&&bytes.length===record.webpBytes,'Actual canonical image differs from its RGB8 lossless roundtrip: '+part+' '+channel);
    textures.push({part,channel,...location,mimeType:'image/webp',width:4096,height:4096,channels:3,bitDepth:8,
      colorSpace:channel==='Base'?'sRGB':'linear',encoding:'lossless-webp',bytes:bytes.length,sha256,
      sourceDecodedRgb8Sha256:record.sourceDecodedRgb8Sha256,runtimeDecodedRgb8Sha256:record.webpDecodedRgb8Sha256,
      ...(isProjected?{projectedSource:projectionOutputs.get(part+':'+channel),highAtlasPixelsInherited:false}:{})});
  }
  const version='20261022Lod40kV13-'+canonical.sha256.slice(0,8),base=browser.states.base;
  const partMetadata={};for(const p of parts){const nodes=base.meshes[p];requireTrue(nodes?.length&&nodes.reduce((n,m)=>n+m.triangles,0)===byPart[p]&&nodes.every(m=>m.effectiveVisible),'Actual browser part geometry is incomplete: '+p);
    partMetadata[p]={independentRoot:p,triangles:byPart[p],defaultVisible:true,boundsM:base.parts[p].bounds,meshNodes:nodes.map(n=>({name:n.name,triangles:n.triangles}))};
  }
  partMetadata.Pack_StrawMat.hideable=true;partMetadata.Pack_StrawMat.endSection='Image-only winding on planar end faces; no internal spiral mesh';
  partMetadata.Pack_Jacket={...partMetadata.Pack_Jacket,hideable:true,fullSizeFoldedGarment:true,withdrawalTranslationM:[0,.36,.30],allDescendantsMoveTogether:true,otherPartTransformsUnchanged:true,unfoldAnimation:false};
  const sourceReferences=[];
  for(const [record,role]of [
    ['Model/SichuanBlanketPack/Data_SichuanWornFibersV08.json','Binding and indigo homespun fibre source'],
    ['Model/SichuanBlanketPack/Data_SichuanOldCottonV09.json','Cotton parent reference and roughness source'],
    ['Model/SichuanBlanketPack/Data_SichuanCottonReliefV10.json','Soft washed cotton albedo and normal source'],
    ['Model/SichuanBlanketPack/Data_SichuanWornStrawV10.json','Worn grass albedo and relief source'],
    ['_import/SichuanBlanketPack/Source/MatEndV12/Data_SichuanMatEndSourceV12.json','Imagegen rolled mat end winding source']]){
    const file=path.join(project,record);requireTrue(fs.existsSync(file),'Source provenance record is missing: '+record);const bytes=fs.readFileSync(file),data=JSON.parse(bytes.toString('utf8'));
    sourceReferences.push({record,role,recordSha256:hash(bytes),...(typeof(data.generator??data.generationSource)==='string'?{generator:data.generator??data.generationSource}:{})});
  }
  const review={verifiedForReview:true,userApproved:false,evidence:{
    rawLodAudit:{passed:true,count:audit.checks.length,actualSha256:audit.sha256,localEvidencePath:ar.file},
    runtimePackaging:{passed:true,count:pack.images.length,actualSha256:retainedGlb.sha256,localEvidencePath:pr.file},
    actualBrowser:{passed:true,count:browser.checks.length,actualSha256:canonical.sha256,localEvidencePath:qr.file}}};
  const metadata={schema:'sichuan-blanket-pack-lod40k-v13',id:'SichuanBlanketPack',version,title:'1938 Sichuan Army folded blanket pack — 40k V13',
    asset:projectPath(model),assetUrl:'/Taierzhuang1938/'+projectPath(model)+'?v='+version,format:document.format,
    assetBytes:canonical.bytes,assetSha256:canonical.sha256,textureManifest:'Model/SichuanBlanketPack/Data_SichuanBlanketPackTextures.json',
    units:'m',upAxis:'+Y',outwardAxis:'+Z',pivotM:[0,0,0],bodyContactPlane:{axis:'Z',coordinateM:0,outwardNormal:[0,0,-1],flatContactAreaM2:audit.parts.Pack_Bundle.flatBackAreaM2},
    nominalBundleDimensionsM:{width:.38,height:.30,depth:.13},actualBundleBoundsM:base.parts.Pack_Bundle.bounds,
    triangles:{total,limit:triangleBudget,byPart,geometryReduced:true,reductionAppliedBeforeNormalTransfer:true,reductionAppliedBeforePbrProjection:isProjected,rawToRuntimeGeometryBytesUnchanged:true},parts:partMetadata,canonicalFiles,
    runtimeGlb:retainedGlb,source:{finalLowBlend:lowSource,highMasterBlend:sourceBlend,highRuntime,rawBakeLocalEvidencePath:br.file,
      reductionLocalEvidence:bake.reductionReport?.path??bake.reduction?.path??null,
      materialProvenance:sourceReferences,materialBakeMode,projectionBake:projection,highAtlasPixelsInherited:!isProjected,exportTangentBasisRepair:bake.tangentBasisRepair??null,rebuildScripts:['_blender/Script_SichuanLod40kBuildV13.py','_blender/Script_SichuanQualityLod40kV13.py','_blender/Script_SichuanQualityNormalTransferV13.py',...(isProjected?['_blender/Script_SichuanStructuredStrawV13.py','_blender/Script_SichuanLodProjectionV13.py','_blender/Script_SichuanNearestSurfaceFallbackV13.py','_blender/Script_SichuanProjectionExportV13.py','_import/Script_SichuanFallbackImagesV13.mjs','_import/Script_SichuanNormalizeProjectedImagesV13.mjs']:[]),'_blender/Script_SichuanLodExportV13.py','_import/Script_SichuanQualityTangentRepairV12.mjs','_import/Script_SichuanFreezeCheckedExportV13.mjs','_import/Script_SichuanLodPackageV13.mjs','_import/Script_SichuanQualityPackageV12.mjs','_import/Script_SichuanLodMetadataV13.mjs']},
    history:[{role:'Historical low-poly backup only',commit:'e80b6824',modelSha256Prefix:'9f6051c0'},{role:'Retained high-quality source',highMasterSha256:sourceBlend.sha256,highRuntimeSha256:highRuntime.sha256}],
    verifiedForReview:true,userApproved:false,review};
  const manifest={schema:'sichuan-lod40k-pbr-textures-v13',id:'SichuanBlanketPack',version,pathsRelativeTo:'Taierzhuang1938',
    model:{path:projectPath(model),bytes:canonical.bytes,sha256:canonical.sha256},
    atlas:{layout:isProjected?'new-low-part-atlas-high-to-low-projection':'retained-V12-part-atlas-footprint-on-reduced-geometry',parts:5,uvSets:[...new Set((bake.objects??[]).map(o=>o.exportUv??o.sourceUv).filter(Boolean))],texCoord:0,uvOrigin:'bottom-left',resolutionPerPart:[4096,4096],materialBakeMode,projectionBake:projection},
    normalConvention:'OpenGL tangent-space +Y',channels:{Base:{colorSpace:'sRGB'},Normal:{colorSpace:'linear'},Orm:{colorSpace:'linear',components:{r:'ambient-occlusion',g:'roughness',b:'metallic (all zero)'}}},
    encoding:{format:'lossless-webp',extension:'EXT_texture_webp',required:true,pngFallback:false,runtimeBitDepth:8,alphaRemoved:true,materialsOpaque:true,
      precision:isProjected?'Fifteen actual high-to-low projection images match raw GLB payloads byte-for-byte; RGB8 decoding is explicit; all lossless WebPs verified byte-exact to those decoded RGB8 buffers.':'V12 Base/ORM decoded RGB8 retained exactly; five V13 transferred normal maps decoded to RGB8 as needed; all lossless WebPs verified byte-exact to decoded RGB8.',
      inheritedBaseOrmImages:isProjected?0:10,baseOrmExactToHighRuntime:!isProjected,newTransferredNormalImages:5,projectedPbrImages:isProjected?15:0,highAtlasPixelsInherited:!isProjected},
    files:textures,totalImageBytes:textures.reduce((n,f)=>n+f.bytes,0),materialProvenance:sourceReferences,
    verifiedForReview:true,userApproved:false,review};
  const writes=[{file:path.join(assetDir,'Data_SichuanBlanketPack.json'),bytes:Buffer.from(JSON.stringify(metadata,null,2)+'\n')},
    {file:path.join(assetDir,'Data_SichuanBlanketPackTextures.json'),bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')}];
  requireTrue(writes.every(w=>contained(assetDir,w.file)),'Metadata destination escaped the canonical asset folder');
  if(!dryRun)atomicPair(writes);
  const result={passed:true,dryRun,version,totalTriangles:total,textureCount:textures.length,canonicalSha256:canonical.sha256,retainedRuntimeGlbSha256:retainedGlb.sha256,
    outputs:writes.map(w=>({path:w.file,bytes:w.bytes.length,sha256:hash(w.bytes)})),sourceDiagnosticsCopied:false};
  console.log(JSON.stringify(result));return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
  if(args.includes('--help'))console.log('node Script_SichuanLodMetadataV13.mjs --bake=<rawBake.json> --package=<runtimePackage.json> --audit=<rawValidation.json> --browser=<browserQA.json> --model=<canonical.gltf|glb> --runtime-glb=<OneDrive final.glb> --low-blend=<OneDrive finalLow.blend> [--dry-run]');
  else try{await WriteLodMetadataV13({bake:option('bake'),package:option('package'),audit:option('audit'),browser:option('browser'),model:option('model'),runtimeGlb:option('runtime-glb'),lowBlend:option('low-blend')},{dryRun:args.includes('--dry-run')});}
  catch(error){console.error(error.stack??String(error));process.exitCode=1;}
}
