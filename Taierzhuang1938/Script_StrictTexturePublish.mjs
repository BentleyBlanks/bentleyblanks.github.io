// Site-wide PC texture compiler: every image follows an explicit path rule.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {EncodeTexture,BasisEncoderInfo} from './Script_TextureImportBuild.mjs';
import {TextureCatalog,NormalizeImportSettings} from './Script_TextureImportRules.mjs';
import {CachedFiles,Hash,Within} from './Script_PublishCache.mjs';
import {ReadStrictRules,StrictRule,SourceInputs,WalkSite,IsImage,IsPublishModel,ReadPublishModel,LocalModelImage} from './Script_StrictTextureRules.mjs';
import {read as ReadKtx} from './vendor/three/examples/jsm/libs/ktx-parse.module.js';

const ColorSlots=new Set(['baseColorTexture','emissiveTexture','specularColorTexture','sheenColorTexture','diffuseTexture']);
const ImageIndex=t=>t?.extensions?.KHR_texture_basisu?.source??t?.extensions?.EXT_texture_webp?.source??t?.source;
export function ImageUses(doc){
  const result=new Map();
  const Visit=value=>{if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){
    if(key.endsWith('Texture')&&Number.isInteger(child?.index)){
      const index=ImageIndex(doc.textures?.[child.index]);if(index===undefined)continue;
      const uses=result.get(index)||new Set();uses.add(ColorSlots.has(key)?'srgb':'linear');result.set(index,uses);
    }else Visit(child);
  }};
  for(const material of doc.materials||[])Visit(material);
  return result;
}
function NormalIndices(doc){
  const result=new Set();const Visit=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){
    if(key==='normalTexture')result.add(ImageIndex(doc.textures?.[child?.index]));else Visit(child);
  }};for(const material of doc.materials||[])Visit(material);return result;
}
export async function ModelBuffers(root,file,model){
  const result=[];
  for(const [index,buffer]of(model.doc.buffers||[]).entries()){
    if(!buffer.uri){if(index!==0||model.bin===null)throw Error('Missing model buffer: '+file);result.push(model.bin);}
    else if(buffer.uri.startsWith('data:'))result.push(Buffer.from(buffer.uri.split(',')[1],'base64'));
    else {const relative=LocalModelImage(file,buffer.uri);if(!relative)throw Error('Remote geometry is not a publication input: '+file);result.push(await fs.readFile(Within(root,relative)));}
  }
  return result;
}
export function ModelView(doc,buffers,index){
  const view=doc.bufferViews[index],buffer=buffers[view.buffer],start=view.byteOffset||0;
  if(!buffer||start<0||view.byteLength<0||start+view.byteLength>buffer.length)throw Error('Invalid model buffer view');
  return buffer.subarray(start,start+view.byteLength);
}
function Pack(doc,chunks){
  let offset=0;const parts=[];
  for(const [index,bytes]of chunks.entries()){
    Object.assign(doc.bufferViews[index],{buffer:0,byteOffset:offset,byteLength:bytes.length});
    const part=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(part);parts.push(part);offset+=part.length;
  }
  doc.buffers=[{byteLength:offset}];
  const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);
  const output=Buffer.alloc(28+json.length+offset);output.writeUInt32LE(0x46546c67);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);
  output.writeUInt32LE(json.length,12);output.writeUInt32LE(0x4e4f534a,16);json.copy(output,20);output.writeUInt32LE(offset,20+json.length);output.writeUInt32LE(0x004e4942,24+json.length);Buffer.concat(parts).copy(output,28+json.length);return output;
}
export function HdrDimensions(bytes){const match=bytes.toString('latin1',0,Math.min(bytes.length,8192)).match(/[-+]Y\s+(\d+)\s+[-+]X\s+(\d+)/);if(!match)throw Error('Invalid Radiance HDR header');return {width:+match[2],height:+match[1]};}
export async function InspectImage(bytes,format){
  if(format==='hdr')return {format:'hdr',...HdrDimensions(bytes)};
  if(format.startsWith('ktx2')){const k=ReadKtx(new Uint8Array(bytes));return {format,codec:k.dataFormatDescriptor[0]?.colorModel,width:k.pixelWidth,height:k.pixelHeight,mipLevels:k.levels.length,colorSpace:k.dataFormatDescriptor[0]?.transferFunction===2?'srgb':'linear'};}
  const meta=await sharp(bytes,{animated:true}).metadata();return {format:meta.format==='webp'&&format==='webp-lossless'?'webp-lossless':meta.format==='jpg'?'jpeg':meta.format,width:meta.width,height:meta.pageHeight||meta.height,pages:meta.pages||1};
}
export async function RewritePublicationReferences(root,replacements){
  const names=new Map();for(const [before,after]of replacements){const name=path.posix.basename(before);const list=names.get(name)||[];list.push([before,after]);names.set(name,list);}
  for(const file of await WalkSite(root)){
    if(!/\.(html|css|mjs|js|json|md|txt)$/i.test(file)||file.includes('/vendor/')||/Data_(?:AssetPublish|TextureImport|TextureManifest|PublishPath|MobileAsset)|Script_.*BrowserBundle/.test(file))continue;
    const target=Within(root,file);let text=await fs.readFile(target,'utf8'),next=text;
    for(const [before,after]of replacements){
      next=next.split(before).join(after);
      const relative=path.posix.relative(path.posix.dirname(file),before),replacement=path.posix.relative(path.posix.dirname(file),after);
      // Full relative URLs plus uniquely named string-table entries.
      for(const quote of ['"',"'",'`'])for(const prefix of ['', './'])next=next.split(quote+prefix+relative).join(quote+prefix+replacement);
    }
    for(const [name,rows]of names)if(rows.length===1)next=next.split(name).join(path.posix.basename(rows[0][1]));
    if(next!==text)await fs.writeFile(target,next);
  }
}
export async function BuildStrictTextures(projectDir,outputDir,{cacheDir=null,log=console.log}={}){
  projectDir=path.resolve(projectDir);outputDir=path.resolve(outputDir);
  if(path.basename(projectDir)!=='Taierzhuang1938'||path.basename(outputDir)!=='Taierzhuang1938')throw Error('Strict publication requires a site/Taierzhuang1938 project directory');
  const sourceRoot=path.dirname(projectDir),siteRoot=path.dirname(outputDir);
  if(sourceRoot===siteRoot)throw Error('Publication requires an isolated site copy');
  const rules=await ReadStrictRules(projectDir),inputs=await SourceInputs(sourceRoot);
  const staged=(await WalkSite(siteRoot)).filter(f=>IsImage(f)||IsPublishModel(f));
  if(JSON.stringify(inputs)!==JSON.stringify(staged))throw Error('Texture coverage mismatch between source and publication copy');
  const sourceRows=new Map();for(const file of inputs){const bytes=await fs.readFile(Within(sourceRoot,file));sourceRows.set(file,{file,sourceBytes:bytes.length,sourceSha256:Hash(bytes)});}
  const report={version:3,pathRules:rules,coverage:[],textures:[],models:[],cache:{hits:0,misses:0},generated:[],removed:[]};
  const generated=new Set(),replacements=new Map(),textureRuntime={},modelRuntime={},externalUses=new Map(),externalNormals=new Set();
  const catalog=new Map(TextureCatalog().map(x=>['Taierzhuang1938/Texture/'+x.file,x]));
  for(const file of inputs.filter(IsPublishModel)){
    const {doc}=ReadPublishModel(await fs.readFile(Within(sourceRoot,file)),file),uses=ImageUses(doc),normals=NormalIndices(doc);
    for(const [index,image]of(doc.images||[]).entries()){const external=LocalModelImage(file,image.uri);if(!external)continue;
      const existing=externalUses.get(external)||new Set();for(const use of uses.get(index)||[])existing.add(use);externalUses.set(external,existing);if(normals.has(index))externalNormals.add(external);
    }
  }
  const work=await fs.mkdtemp(path.join(os.tmpdir(),'StrictTexturePublish-'));
  try{
    await fs.mkdir(path.join(work,'Texture'));
    const encoder=await BasisEncoderInfo();
    const toolchain={sharp:sharp.versions,encoder:encoder.sha256,pipeline:4,scripts:await Promise.all(['Script_TextureImportBuild.mjs','Script_TextureImportPixels.mjs','Script_TextureImportRules.mjs'].map(async file=>Hash(await fs.readFile(new URL(file,import.meta.url)))))};
    const Encode=async(bytes,file,colorSpace,normal,orientations,mipmaps=true)=>{
      const rule=StrictRule(rules,file),format=rule.format;
      if(format==='hdr'){
        const dimensions=HdrDimensions(bytes);if(Math.max(dimensions.width,dimensions.height)>rule.maxSize)throw Error('HDR exceeds explicit maximum: '+file);
        return {bytes,format,...dimensions,mipLevels:1};
      }
      if(externalUses.get(file)?.size>1)throw Error('Image used with conflicting color spaces: '+file);
      const gpu=format.startsWith('ktx2'),meta=await sharp(bytes,{animated:true}).metadata();
      const item={file:'Texture_Input'+(format==='jpeg'?'.jpg':'.png'),colorSpace,gpu:true,sampler:true};
      const input={format,maxSize:rule.maxSize,quality:rule.quality??40,colorSpace,textureType:normal?'normal':'inherit',mipmaps:gpu?mipmaps:false};
      const normalized=NormalizeImportSettings(input,item);
      const key=Hash(Buffer.concat([bytes,Buffer.from(JSON.stringify({normalized,orientations,toolchain,pages:meta.pages||1}))]));
      const target=path.join(work,'Encoded');
      const cached=await CachedFiles(cacheDir,key,target,async()=>{
        await fs.writeFile(path.join(work,'Texture',item.file),bytes);
        if((meta.pages||1)>1){
          if(!['webp','webp-lossless'].includes(format))throw Error('Animated image requires a WebP path rule: '+file);
          const ratio=Math.min(1,rule.maxSize/Math.max(meta.width,meta.pageHeight));const width=Math.max(1,Math.round(meta.width*ratio)),height=Math.max(1,Math.round(meta.pageHeight*ratio));
          const filename='Texture_Animated_'+key.slice(0,24)+'.webp';await fs.mkdir(target,{recursive:true});await sharp(bytes,{animated:true}).resize(width,height).webp({lossless:format==='webp-lossless',quality:rule.quality??90,effort:4}).toFile(path.join(target,filename));
          return {value:{filename,width,height,pages:meta.pages,format,colorSpace},names:[filename]};
        }
        const value=await EncodeTexture(work,item,input,target,{uastcRdo:.5,orientations});
        return {value,names:[...new Set([value.filename,value.unflipped].filter(Boolean))]};
      });
      report.cache[cached.hit?'hits':'misses']++;
      const result=cached.value,encoded=await fs.readFile(Within(target,result.filename)),noFlip=result.unflipped?await fs.readFile(Within(target,result.unflipped)):null;
      const inspected=await InspectImage(encoded,format);if(inspected.format!==format||Math.max(inspected.width,inspected.height)>rule.maxSize)throw Error('Texture output violates path rule: '+file);
      return {...result,...inspected,bytes:encoded,noFlip,format};
    };
    const imageResults=new Map();
    for(const file of inputs.filter(IsImage)){
      const row=sourceRows.get(file),bytes=await fs.readFile(Within(sourceRoot,file)),rule=StrictRule(rules,file),known=catalog.get(file),uses=externalUses.get(file);
      const colorSpace=rule.colorSpace||(uses?.size===1?[...uses][0]:known?.colorSpace||(/(?:Normal|Orm|Orh|Mask|Height|Detail|Lighting)/.test(file)?'linear':'srgb'));
      const normal=known?.channel==='Normal'||externalNormals.has(file)||/Normal[_.]/i.test(file);
      if(known&&!known.gpu&&rule.format.startsWith('ktx2'))throw Error('CPU/UI consumer requires an explicit PNG/WebP path rule: '+file);
      const result=await Encode(bytes,file,colorSpace,normal,[true,false]);
      const extension=result.format.startsWith('ktx2')?'ktx2':result.format.startsWith('webp')?'webp':result.format==='jpeg'?'jpg':result.format;
      const output=file.replace(/\.[^.]+$/,`_Publish${Hash(result.bytes).slice(0,24)}.${extension}`);
      await fs.writeFile(Within(siteRoot,output),result.bytes);generated.add(output);
      let unflipped=null;
      if(result.noFlip){unflipped=file.replace(/\.[^.]+$/,`_Publish${Hash(result.noFlip).slice(0,24)}_NoFlip.ktx2`);await fs.writeFile(Within(siteRoot,unflipped),result.noFlip);generated.add(unflipped);}
      const record={...row,output,format:result.format,width:result.width,height:result.height,pages:result.pages||1,mipLevels:result.mipLevels||1,colorSpace,bytes:result.bytes.length,sha256:Hash(result.bytes),unflipped:unflipped&&{output:unflipped,bytes:result.noFlip.length,sha256:Hash(result.noFlip)}};
      report.textures.push(record);report.coverage.push({...row,kind:'image',status:'processed',outputs:[output,unflipped].filter(Boolean)});
      const entry={...normalizedEntry(result),publicationFile:file,publicationOutput:output,publicationUnflipped:unflipped,output,unflipped,siteRelative:true,managedOnly:file.includes('/Model/')||!file.startsWith('Taierzhuang1938/Texture/')};
      textureRuntime[file]=entry;textureRuntime[output]=entry;if(unflipped)textureRuntime[unflipped]=entry;
      imageResults.set(file,{record,bytes:result.noFlip||result.bytes,output:unflipped||output});replacements.set(file,output);
      log(`TEXTURE ${file} -> ${result.format} ${result.width}x${result.height}`);
    }
    for(const file of inputs.filter(IsPublishModel)){
      const source=await fs.readFile(Within(sourceRoot,file)),model=ReadPublishModel(source,file),row=sourceRows.get(file);
      if(!model.doc.images?.length){report.coverage.push({...row,kind:'model',status:'no-images',outputs:[file]});continue;}
      const buffers=await ModelBuffers(sourceRoot,file,model),doc=structuredClone(model.doc),uses=ImageUses(doc),normals=NormalIndices(doc);
      if((doc.bufferViews||[]).some(v=>v.extensions?.EXT_meshopt_compression))throw Error('Cannot repack meshopt image buffers without a safe adapter: '+file);
      const chunks=(doc.bufferViews||[]).map((_,i)=>ModelView(doc,buffers,i)),imageViews=new Set(),images=[];
      const protectedViews=new Set((doc.accessors||[]).flatMap(a=>[a.bufferView,a.sparse?.indices?.bufferView,a.sparse?.values?.bufferView]).filter(Number.isInteger));
      for(const [index,image]of doc.images.entries()){
        const external=LocalModelImage(file,image.uri);let record,encoded;
        if(external){const result=imageResults.get(external);if(!result)throw Error('Missing processed external image: '+external);record={...result.record,index,file:external,externalOutput:result.output,sha256:Hash(result.bytes),bytes:result.bytes.length};encoded=result.bytes;image.uri=path.posix.relative(path.posix.dirname(file),result.output);delete image.bufferView;}
        else {
          let pixels;
          if(image.uri?.startsWith('data:'))pixels=Buffer.from(image.uri.split(',')[1],'base64');
          else if(Number.isInteger(image.bufferView)){
            if(protectedViews.has(image.bufferView))throw Error('Image shares geometry bytes: '+file);
            pixels=ModelView(model.doc,buffers,image.bufferView);imageViews.add(image.bufferView);
          }else throw Error('Unsupported embedded image: '+file+'#'+index);
          const roles=uses.get(index);if(roles?.size>1)throw Error('Conflicting embedded image color spaces: '+file+'#'+index);
          const rule=StrictRule(rules,file),colorSpace=rule.colorSpace||(roles?.size?[...roles][0]:'linear');
          const mipmaps=(doc.textures||[]).some(t=>ImageIndex(t)===index&&![9728,9729].includes(doc.samplers?.[t.sampler]?.minFilter));
          const result=await Encode(pixels,file,colorSpace,normals.has(index),[false],mipmaps);encoded=result.bytes;
          record={index,file,sourceBytes:pixels.length,sourceSha256:Hash(pixels),format:result.format,width:result.width,height:result.height,mipLevels:result.mipLevels||1,colorSpace,bytes:encoded.length,sha256:Hash(encoded)};
        }
        if(!external){const viewIndex=doc.bufferViews?.length||0;doc.bufferViews??=[];doc.bufferViews.push({buffer:0,byteLength:encoded.length});chunks.push(encoded);image.bufferView=viewIndex;delete image.uri;}
        image.mimeType=record.format.startsWith('ktx2')?'image/ktx2':record.format.startsWith('webp')?'image/webp':record.format==='jpeg'?'image/jpeg':'image/png';
        image.extras={...image.extras,publicationFormat:record.format};images.push(record);
      }
      // Remove obsolete embedded raster payloads, without touching geometry views.
      for(const index of imageViews)chunks[index]=Buffer.alloc(4);
      for(const texture of doc.textures||[]){const index=ImageIndex(texture);if(index===undefined)continue;const format=images[index].format;texture.extensions={...texture.extensions};delete texture.extensions.KHR_texture_basisu;delete texture.extensions.EXT_texture_webp;delete texture.source;
        if(format.startsWith('ktx2'))texture.extensions.KHR_texture_basisu={source:index};else if(format.startsWith('webp'))texture.extensions.EXT_texture_webp={source:index};else texture.source=index;
      }
      for(const key of ['extensionsUsed','extensionsRequired']){
        doc[key]=(doc[key]||[]).filter(x=>!['KHR_texture_basisu','EXT_texture_webp'].includes(x));
        for(const [test,extension]of [[x=>x.format.startsWith('ktx2'),'KHR_texture_basisu'],[x=>x.format.startsWith('webp'),'EXT_texture_webp']])if(images.some(test))doc[key].push(extension);
      }
      const encoded=Pack(doc,chunks),output=file.replace(/\.(glb|gltf)$/i,`_Publish${Hash(encoded).slice(0,24)}.glb`);
      const checked=ReadPublishModel(encoded,output),checkedBuffers=[checked.bin];
      for(let i=0;i<(model.doc.bufferViews?.length||0);i++)if(!imageViews.has(i)&&!ModelView(model.doc,buffers,i).equals(ModelView(checked.doc,checkedBuffers,i)))throw Error('Geometry/animation bytes changed: '+file);
      for(const key of ['nodes','meshes','skins','animations','accessors','materials','scenes','cameras'])if(JSON.stringify(model.doc[key])!==JSON.stringify(checked.doc[key]))throw Error('Model structure changed: '+file);
      await fs.writeFile(Within(siteRoot,output),encoded);generated.add(output);modelRuntime[file]=output;replacements.set(file,output);
      report.models.push({...row,output,bytes:encoded.length,sha256:Hash(encoded),images});report.coverage.push({...row,kind:'model',status:'processed',outputs:[output]});log(`MODEL ${file}: ${images.length} images processed`);
    }
    await RewritePublicationReferences(siteRoot,replacements);
    for(const file of replacements.keys()){await fs.unlink(Within(siteRoot,file));report.removed.push(file);}
    await fs.writeFile(path.join(outputDir,'Data_TextureImportRuntime.mjs'),'export const TEXTURE_IMPORT_RUNTIME = '+JSON.stringify(textureRuntime)+';\n');
    await fs.writeFile(path.join(outputDir,'Data_AssetPublishRuntime.mjs'),'export const ASSET_PUBLISH_RUNTIME = '+JSON.stringify(modelRuntime)+';\n');
    await fs.writeFile(path.join(outputDir,'Data_MobileAssetRuntime.mjs'),'export const MOBILE_ASSET_RUNTIME = {"textures":{},"models":{}};\n');
    report.generated=[...generated].sort();report.summary={inputFiles:inputs.length,standaloneImages:report.textures.length,modelsWithImages:report.models.length,embeddedImages:report.models.reduce((n,m)=>n+m.images.length,0),unprocessedImages:0};
    await fs.writeFile(path.join(outputDir,'Data_AssetPublishReport.json'),JSON.stringify(report,null,2)+'\n');return report;
  }finally{await fs.rm(work,{recursive:true,force:true});}
}
function normalizedEntry(result){return {format:result.format,width:result.width,height:result.height,colorSpace:result.colorSpace,mipmaps:result.mipLevels>1,mipLevels:result.mipLevels||1,bytes:result.bytes.length,variants:{}};}
