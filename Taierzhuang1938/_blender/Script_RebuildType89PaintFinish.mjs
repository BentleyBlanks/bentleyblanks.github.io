// Reconstruct this finish from the immutable complete SurfaceV12 source pair.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {LoadGlb,SerializeGlb} from '../_import/Script_LugouGlbPose.mjs';
const repo=path.resolve(import.meta.dirname,'../..'),project=path.join(repo,'Taierzhuang1938'),revision=JSON.parse(fs.readFileSync(path.join(project,'Model/Type89MediumTank/Data_PaintFinishProfile.json'),'utf8')).revision,source=path.join('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank',revision),out=path.join(repo,'tmp/Type89'+revision),review=path.join(project,'_shots/Type89MediumTank/'+revision+'Study');
const Arg=(name,fallback)=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
if(process.argv.includes('--help')){console.log('Rebuild Type89 paint/steel finish from its retained complete SurfaceV12 pair.\n --resume=apply skips extraction/rasterization only when their profile/source hashes match\n --resume=pack verifies the saved editable sources and packages their material maps\nOutputs stay in OneDrive/Type89MediumTank/<revision> and ignored local review folders. The canonical game asset is not overwritten.');process.exit(0)}
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(review,{recursive:true});
const Read=file=>JSON.parse(fs.readFileSync(file,'utf8')),Write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n'),Sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const profileFile=path.join(project,'Model/Type89MediumTank/Data_PaintFinishProfile.json'),profile=Read(profileFile),profileSha=Sha(profileFile),state={pid:process.pid,startedAt:new Date().toISOString(),steps:[]};
function State(phase,extra={}){Object.assign(state,{phase,...extra});Write(path.join(out,'Data_Rebuild.json'),state);console.log(phase)}
function Run(label,args,exe=process.execPath){State(label);const log=path.join(out,'Log_'+label+'.txt'),fd=fs.openSync(log,'w');let r;try{r=spawnSync(exe,args,{cwd:repo,windowsHide:true,stdio:['ignore',fd,fd]})}finally{fs.closeSync(fd)}state.steps.push({label,exitCode:r.status,log});assert.equal(r.status,0,'Inspect '+log)}
function Batch(phase){const args=path.join(out,'Data_'+phase+'Args.json');Write(args,['--phase='+phase,...(Arg('baseline','')?['--baseline='+Arg('baseline','')]:[])]);Run(phase,['scripts/Script_BlenderMcp.mjs','start','--batch','Taierzhuang1938/_blender/Script_Type89PaintFinish.py','--batch-args',args,'--task','Type89PaintFinish'+phase])}
const ImageOf=(g,info)=>{const texture=g.textures[info.index];return texture.extensions?.EXT_texture_webp?.source??texture.source};
function FreezeRuntimeMaps(){
 const file=path.join(source,'Data_PaintFinishBuild.json'),manifest=Read(file);
 for(const row of manifest.rows){const g=LoadGlb(row.glb);assert.equal(Sha(row.glb),row.glbSha256);for(const role of ['Armor','Guard'])for(const label of ['Base','Orm','MicroCoatData']){const m=g.json.materials.find(v=>v.name==='Material_Type89'+row.quality+role),info=label==='Base'?m.pbrMetallicRoughness.baseColorTexture:label==='Orm'?m.pbrMetallicRoughness.metallicRoughnessTexture:m.extensions.KHR_materials_clearcoat.clearcoatTexture,image=g.json.images[ImageOf(g.json,info)],view=g.json.bufferViews[image.bufferView],entry=row.maps[role+label],target=path.join(path.dirname(entry.file),role+label+'_Runtime.'+(image.mimeType==='image/webp'?'webp':'png'));fs.writeFileSync(target,g.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength));entry.packedSourceFile=entry.file;entry.file=target;entry.sha256=Sha(target);entry.baselinePixels='Exact published GLB image payload, including RGB beneath MASK transparency';}}
 Write(file,manifest);
}
function CompactUnusedImages(g,bin,original){
 const referenced=new Set();function Visit(value){if(!value||typeof value!=='object')return;for(const[key,item]of Object.entries(value)){if(key==='bufferView'&&Number.isInteger(item))referenced.add(item);else Visit(item)}}Visit(g);
 const oldImages=new Set(original.json.images.map(image=>image.bufferView)),dead=new Set([...oldImages].filter(index=>!referenced.has(index))),chunks=[];let offset=0;
 for(let index=0;index<g.bufferViews.length;index++){const view=g.bufferViews[index],bytes=dead.has(index)?Buffer.alloc(4):bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad}view.byteOffset=offset;view.byteLength=bytes.length;chunks.push(bytes);offset+=bytes.length;}
 const compact=Buffer.concat(chunks),geometryViews=new Set(original.json.accessors.flatMap(a=>[a.bufferView,a.sparse?.indices?.bufferView,a.sparse?.values?.bufferView]).filter(Number.isInteger));
 for(const index of geometryViews){assert(!dead.has(index));const old=original.json.bufferViews[index],now=g.bufferViews[index];assert(original.bin.subarray(old.byteOffset??0,(old.byteOffset??0)+old.byteLength).equals(compact.subarray(now.byteOffset,now.byteOffset+now.byteLength)),'Geometry/source-index buffer changed during image compaction');}
 return{bin:compact,deadImagePayloads:dead.size,geometryViews:geometryViews.size};
}
try{
 const resume=Arg('resume','');assert(['','apply','pack'].includes(resume));
 if(!resume){Batch('Extract');FreezeRuntimeMaps();Run('Maps',['Taierzhuang1938/_blender/Script_Type89PaintFinishMaps.py',path.join(source,'Data_PaintFinishBuild.json')],Arg('python','python'))}
 const manifest=Read(path.join(source,'Data_PaintFinishBuild.json')),maps=Read(path.join(source,'Data_PaintFinishMaps.json'));assert(manifest.profileSha256===profileSha&&maps.profileSha256===profileSha&&maps.pass);
 for(const row of manifest.rows)assert.equal(Sha(row.blend),row.sourceSha256,'Retained baseline changed');
 if(resume!=='pack')Batch('Apply');
 const sources=Read(path.join(source,'Data_PaintFinishSources.json'));assert(sources.pass&&sources.profileSha256===profileSha);
 State('Package');
 const built=[];
 for(const row of manifest.rows){
  const quality=row.quality,sourceRow=sources.rows.find(r=>r.quality===quality);assert.equal(Sha(sourceRow.blend),sourceRow.sha256);assert.equal(Sha(row.glb),row.glbSha256);
  const baseline=LoadGlb(row.glb),g=structuredClone(baseline.json),chunks=[baseline.bin];let offset=baseline.bin.length;const imageRows=[];
  const materialFor=role=>g.materials.find(m=>m.name==='Material_Type89'+quality+role);
  for(const role of ['Armor','Guard'])for(const label of ['Base','Orm','MicroCoatData']){
   const material=materialFor(role),info=label==='Base'?material.pbrMetallicRoughness.baseColorTexture:label==='Orm'?material.pbrMetallicRoughness.metallicRoughnessTexture:material.extensions.KHR_materials_clearcoat.clearcoatTexture,index=ImageOf(g,info),file=maps.rows.find(r=>r.quality===quality).files[role+label];
   let encoder=sharp(file);const alpha=role==='Guard'&&label==='Base';if(!alpha)encoder=encoder.removeAlpha();const raw=await encoder.raw().toBuffer({resolveWithObject:true}),options={raw:{width:raw.info.width,height:raw.info.height,channels:raw.info.channels}},png=await sharp(raw.data,options).png().toBuffer();let bytes=png,mime='image/png';
   if(quality==='Game'){const webp=await sharp(raw.data,options).webp({lossless:true,effort:1}).toBuffer(),decoded=await (alpha?sharp(webp).ensureAlpha():sharp(webp).removeAlpha()).raw().toBuffer();if(decoded.equals(raw.data)&&webp.length<png.length){bytes=webp;mime='image/webp'}}
   const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad}const bufferView=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});g.images[index].bufferView=bufferView;g.images[index].mimeType=mime;chunks.push(bytes);offset+=bytes.length;
   for(const texture of g.textures){const sourceIndex=texture.extensions?.EXT_texture_webp?.source??texture.source;if(sourceIndex!==index)continue;if(mime==='image/webp'){texture.extensions={...texture.extensions,EXT_texture_webp:{source:index}};delete texture.source}else{texture.source=index;if(texture.extensions)delete texture.extensions.EXT_texture_webp}}
   imageRows.push({role,label,image:index,file,sha256:Sha(file),bytes:bytes.length,mime,opacityPreserved:alpha});
  }
  for(const[role,p]of Object.entries(profile.roles)){const material=materialFor(role),coat=material.extensions.KHR_materials_clearcoat;coat.clearcoatRoughnessFactor=p.coatRoughnessScale;const fine=role==='CastArmor'?material.normalTexture:coat.clearcoatNormalTexture;fine.scale=p.fineNormalScale;fine.extensions.KHR_texture_transform.scale=fine.extensions.KHR_texture_transform.scale.map(v=>v*(role==='CastArmor'?.224:.168)/p.fineTileM)}
  const root=g.nodes.find(n=>n.name==='Model_Type89MediumTank');root.extras.surfaceRevision=profile.revision;root.extras.paintFinish={profileSha256:profileSha,baselineSha256:row.glbSha256,newDamageMask:profile.contactWear.newDamageMask,appearanceReconstruction:true};
  const compact=CompactUnusedImages(g,Buffer.concat(chunks),baseline);g.buffers[0].byteLength=compact.bin.length;const file=path.join(review,`Model_Type89MediumTank${quality}Pbr.glb`);fs.writeFileSync(file,SerializeGlb(g,compact.bin));if(quality==='Game')assert(fs.statSync(file).size<100*1024*1024,'Single-file GitHub limit');
  built.push({quality,file,sha256:Sha(file),bytes:fs.statSync(file).size,source:sourceRow.blend,sourceSha256:sourceRow.sha256,sourceExport:sourceRow.export,baseline:row.glb,baselineSha256:row.glbSha256,geometryBufferViewsExact:true,removedUnusedImagePayloads:compact.deadImagePayloads,imageRows});
 }
 fs.copyFileSync(path.join(project,'Model/Type89MediumTank/Data_TrackPath.json'),path.join(review,'Data_TrackPath.json'));
 for(const name of ['Script_Type89PaintFinish.py','Script_Type89PaintFinishMaps.py','Script_RebuildType89PaintFinish.mjs']){const target=path.join(source,'Rebuild',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(project,'_blender',name),target)}
 fs.copyFileSync(profileFile,path.join(source,'Rebuild/Data_PaintFinishProfile.json'));
 for(const row of built){Run(row.quality+'SourceTangents',['Taierzhuang1938/_blender/Script_Type89SurfaceTangents.mjs','--baseline='+row.baseline,'--file='+row.sourceExport,'--report='+path.join(out,'Data_'+row.quality+'SourceTangents.json')]);Run(row.quality+'PaintAudit',['Taierzhuang1938/_blender/Script_Type89PaintFinishAudit.mjs','--baseline='+row.baseline,'--file='+row.file,'--source-export='+row.sourceExport,'--quality='+row.quality,'--surface-context='+path.join(source,'Data_PaintFinishBuild.json'),'--report='+path.join(out,'Data_'+row.quality+'PaintAudit.json')]);}
 const contract=Read(path.join(project,'Model/Type89MediumTank/Data_ReferenceContract.json'));contract.materialRevision=profile.revision;contract.runtimeSha256=built.find(r=>r.quality==='Game').sha256;const contractFile=path.join(out,'Data_CandidateContract.json');Write(contractFile,contract);
 Run('RawFile',['Taierzhuang1938/Script_Type89MediumTankTest.mjs','--file='+built.find(r=>r.quality==='Game').file,'--contract='+contractFile]);
 const args=path.join(out,'Data_SourceReopenArgs.json');Write(args,['--source-dir='+source,'--contract='+contractFile]);Run('SourceReopen',['scripts/Script_BlenderMcp.mjs','start','--batch','Taierzhuang1938/_blender/Script_Type89SourceAudit.py','--batch-args',args,'--task','Type89PaintSources']);
 Run('Renderer',['Taierzhuang1938/Script_Type89MediumTankBrowserTest.mjs','--model=/Taierzhuang1938/_shots/Type89MediumTank/'+revision+'Study/Model_Type89MediumTankGamePbr.glb','--track-path=/Taierzhuang1938/_shots/Type89MediumTank/'+revision+'Study/Data_TrackPath.json']);
 const record={status:'MaterialCandidateVerified_VisualReviewRequired',revision:profile.revision,profileSha256:profileSha,geometryVersion:'20261027GeometryV54',rows:built,contractFile,steps:state.steps};Write(path.join(out,'Data_Build.json'),record);State('CandidateReady',{terminal:true});
}catch(error){State('Failed',{error:String(error),stack:error.stack,terminal:true});process.exitCode=1}
