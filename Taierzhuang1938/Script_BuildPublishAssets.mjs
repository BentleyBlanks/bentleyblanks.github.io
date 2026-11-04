// One publish-only entry: explicit importer settings, automatic GPU textures, embedded GLB images.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {ASSET_PUBLISH} from './Data_AssetPublish.mjs';
import {TextureCatalog, NormalizeImportSettings, ImportDimensions} from './Script_TextureImportRules.mjs';
import {EncodeTexture, BasisEncoderInfo} from './Script_TextureImportBuild.mjs';
import {BuildTextureImports} from './Script_BuildTextureImports.mjs';
import {CachedFiles, Hash, Within} from './Script_PublishCache.mjs';
import {read as ReadKtx} from './vendor/three/examples/jsm/libs/ktx-parse.module.js';
import {BuildMobileAssets} from './Script_PublishMobileAssets.mjs';
import {LoadPathRules, ResolvePathRule, DiscoverPublishInputs, ExpectedPublishInputs, IsPublishModel, ReadPublishModel, LocalModelImage} from './Script_PublishAssetPaths.mjs';

const require = createRequire(import.meta.url);
const ownDir = path.dirname(fileURLToPath(import.meta.url));
const Toolchain = async project => ({sharp: sharp.versions, basis: require('@gpu-tex-enc/basis/package.json').version,
  encoder: await BasisEncoderInfo().then(({binary,sha256,version,threadArgs}) => ({binary,sha256,version,threadArgs})),
  platform: process.platform, arch: process.arch, pipeline: ASSET_PUBLISH.version,
  scripts: await Promise.all(['Script_TextureImportBuild.mjs','Script_TextureImportPixels.mjs','Script_TextureImportRules.mjs']
    .map(async file => [file, Hash(await fs.readFile(Within(project, file)))]))});
const Names = result => [...new Set([result.filename, result.unflipped, result.cpuFile, ...(result.mipFiles || [])].filter(Boolean))];
const MipBytes = (width, height, compressed, blockBytes = 16) => {
  let bytes = 0;
  for (;;) {
    bytes += compressed ? Math.ceil(width / 4) * Math.ceil(height / 4) * blockBytes : width * height * 4;
    if (width === 1 && height === 1) return bytes;
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  }
};
export function InspectKtx(bytes, width, height, colorSpace, mipmaps = true) {
  const doc = ReadKtx(new Uint8Array(bytes));
  if (doc.pixelWidth !== width || doc.pixelHeight !== height || doc.pixelDepth || doc.faceCount !== 1)
    throw Error('Published KTX dimensions/type differ from source');
  const expected = mipmaps ? Math.floor(Math.log2(Math.max(width, height))) + 1 : 1;
  if (doc.levels.length !== expected) throw Error('Published KTX mip chain is incomplete');
  const codec = doc.dataFormatDescriptor[0]?.colorModel === 166 ? 'uastc' : doc.dataFormatDescriptor[0]?.colorModel === 163 ? 'etc1s' : null;
  if (doc.vkFormat !== 0 || !codec || codec === 'etc1s' && colorSpace === 'linear') throw Error('Invalid portable GPU texture codec');
  if (colorSpace && doc.dataFormatDescriptor[0].transferFunction !== (colorSpace === 'srgb' ? 2 : 1)) throw Error('Published KTX color space differs from source');
  const blockBytes = codec === 'etc1s' ? 8 : 16;
  return {width, height, codec, mipLevels: expected, bytes: bytes.length, rgbaBytes: mipmaps ? MipBytes(width, height, false) : width*height*4,
    gpuBytes: mipmaps ? MipBytes(width, height, true, blockBytes) : Math.ceil(width/4)*Math.ceil(height/4)*blockBytes, sha256: Hash(bytes)};
}
async function ImageEligibility(bytes, colorSpace, allowCompact = false) {
  const meta = await sharp(bytes).metadata();
  const {width, height} = meta;
  if (!width || !height || width % 4 || height % 4) return {width, height, reason: 'block-alignment: original dimensions retained'};
  const compact = allowCompact && colorSpace === 'srgb' && (!meta.hasAlpha || (await sharp(bytes).stats()).isOpaque);
  const blockBytes = compact ? 8 : 16;
  if (bytes.length < MipBytes(width,height,true,blockBytes) * ASSET_PUBLISH.minSourceToGpuRatio)
    return {width,height,reason:'already compact source: avoid download growth',sourceBytes:bytes.length,gpuBlockBytes:MipBytes(width,height,true,blockBytes)};
  // Do not reinterpret alpha as transparency when it carries independent data.
  if (colorSpace === 'linear' && meta.hasAlpha) {
    const data = await sharp(bytes).ensureAlpha().raw().toBuffer();
    for (let i = 0; i < data.length; i += 4)
      if (!data[i + 3] && (data[i] || data[i + 1] || data[i + 2])) return {width, height, reason: 'independent RGB beneath zero data alpha: lossless source retained'};
  }
  return {width, height, compact};
}
function ReadGlb(bytes) {
  return ReadPublishModel(bytes,'Model.glb');
}
const View = (glb, i) => {
  const view = glb.doc.bufferViews[i];
  if (view.buffer !== 0 || view.byteLength < 0 || (view.byteOffset || 0) + view.byteLength > glb.bin.length) throw Error('Invalid GLB buffer view');
  return glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
};
function PackGlb(doc, chunks) {
  let offset = 0;
  const blocks = chunks.map((bytes, i) => {
    doc.bufferViews[i].byteOffset = offset; doc.bufferViews[i].byteLength = bytes.length;
    const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(padded); offset += padded.length; return padded;
  });
  doc.buffers[0].byteLength = offset;
  const json = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
  const output = Buffer.alloc(28 + padded.length + offset);
  output.writeUInt32LE(0x46546c67,0); output.writeUInt32LE(2,4); output.writeUInt32LE(output.length,8);
  output.writeUInt32LE(padded.length,12); output.writeUInt32LE(0x4e4f534a,16); padded.copy(output,20);
  output.writeUInt32LE(offset,20+padded.length); output.writeUInt32LE(0x004e4942,24+padded.length);
  Buffer.concat(blocks).copy(output,28+padded.length); return output;
}
const ImageOf = texture => texture.extensions?.EXT_texture_webp?.source ?? texture.source;
export function GlbImageRoles(doc) {
  const roles = new Map();
  const Visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith('Texture') && Number.isInteger(child?.index)) {
        const texture = doc.textures?.[child.index]; if (!texture) throw Error('Invalid material texture index');
        const index = ImageOf(texture); if (index === undefined) continue;
        const color = ['baseColorTexture','emissiveTexture','specularColorTexture','sheenColorTexture','diffuseTexture','specularGlossinessTexture'].includes(key);
        const role = color ? 'srgb' : 'linear';
        const entry = roles.get(index) || new Set(); entry.add(role); roles.set(index, entry);
      } else Visit(child);
    }
  };
  for (const material of doc.materials || []) Visit(material);
  return roles;
}
function NormalImages(doc) {
  const found=new Set();
  const Visit=value=>{if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){
    if(key==='normalTexture'&&Number.isInteger(child?.index)){const texture=doc.textures?.[child.index];if(texture)found.add(ImageOf(texture));}
    else Visit(child);
  }};
  for(const material of doc.materials||[])Visit(material);
  return found;
}
export async function BuildPublishAssets(projectDir, outputDir, {cacheDir = null, textureFiles = null, modelFiles = null, mobile = true, mobileModelFiles = null, log = console.log} = {}) {
  projectDir = path.resolve(projectDir); outputDir = path.resolve(outputDir);
  if (projectDir === outputDir) throw Error('Publish assets require a separate staging directory');
  const toolchain = await Toolchain(projectDir), stats = {hits: 0, misses: 0};
  const pathRules=await LoadPathRules(projectDir);
  const previous=await fs.readFile(Within(outputDir,'Data_AssetPublishReport.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return {};throw error;});
  const generated=new Set(previous.generated||[]);
  for(const file of [...(modelFiles||[]),...(textureFiles||[]).map(file=>'Texture/'+file)]) {
    const target=Within(outputDir,file);await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(Within(projectDir,file),target);
  }
  const inputs=await DiscoverPublishInputs(outputDir,pathRules,{modelFiles,textureFiles,generated:[...generated]});
  const expected=await ExpectedPublishInputs(projectDir,pathRules,{modelFiles,textureFiles});
  if(JSON.stringify(inputs)!==JSON.stringify(expected))throw Error('Publication coverage mismatch: source/staging input sets differ');
  const report = {version: 2, policy: ASSET_PUBLISH, pathRules, selection:{modelFiles,textureFiles}, toolchain, textures: [], models: [], skipped: [], coverage:[], cache: stats};
  const coverage=new Map();
  for(const file of inputs){const source=await fs.readFile(Within(projectDir,file));const row={file,sourceBytes:source.length,sourceSha256:Hash(source),status:'pending',outputs:[]};coverage.set(file,row);report.coverage.push(row);}
  const Retain=(file,reason)=>Object.assign(coverage.get(file),{status:'retained',reason});
  const Encoded=(file,outputs)=>{Object.assign(coverage.get(file),{status:'encoded',outputs});outputs.forEach(output=>generated.add(output));};
  const settings = JSON.parse(await fs.readFile(Within(projectDir,'Data_TextureImportSettings.json'),'utf8'));
  const Encode = async (sourceDir, item, input, target, encoding = {}) => {
    const normalized = NormalizeImportSettings(input, item), source = await fs.readFile(Within(sourceDir,'Texture/' + item.file));
    const key = Hash(Buffer.concat([source,Buffer.from(JSON.stringify({normalized, file: path.basename(item.file), colorSpace: item.colorSpace, encoding, toolchain}))]));
    const cached = await CachedFiles(cacheDir, key, target, async () => {
      const value = await EncodeTexture(sourceDir,item,input,target,encoding);
      return {value, names: Names(value)};
    });
    stats[cached.hit ? 'hits' : 'misses']++;
    return cached.value;
  };
  await BuildTextureImports(projectDir, outputDir, settings, {encode: Encode});
  // Read generated module without importing/caching it: repeated builds must see this run's table.
  const runtimeFile = Within(outputDir,'Data_TextureImportRuntime.mjs');
  const runtime = JSON.parse((await fs.readFile(runtimeFile,'utf8')).match(/=\s*([\s\S]*);\s*$/)[1]);
  for(const entry of Object.values(runtime))for(const row of [entry,...Object.values(entry.variants||{})])
    for(const name of [row.output,row.unflipped,row.cpuFile,...(row.mipFiles||[])].filter(Boolean))generated.add('Texture/'+name);
  for (const item of TextureCatalog().filter(item=>coverage.has('Texture/'+item.file))) {
    const file='Texture/'+item.file, rule=ResolvePathRule(pathRules,file);
    if (settings.textures[item.file]) { const entry=runtime[item.file];Encoded(file,[entry,...Object.values(entry.variants||{})].flatMap(row=>[row.output,row.unflipped,row.cpuFile,...(row.mipFiles||[])].filter(Boolean).map(name=>'Texture/'+name)));if(entry.format==='source')Retain(file,'explicit manual source format');report.skipped.push({file, reason: 'explicit importer configuration takes precedence'}); continue; }
    if (!item.gpu || item.tier === 'offline' || rule.format==='source') { const reason=rule.format==='source'?rule.reason:item.restriction||'offline source';Retain(file,reason);report.skipped.push({file, reason});continue; }
    const source = await fs.readFile(Within(projectDir,'Texture/' + item.file));
    const eligibility = await ImageEligibility(source,item.colorSpace,item.kind === 'material');
    if (eligibility.reason && rule.format==='auto' && !rule.maxSize) { Retain(file,eligibility.reason);report.skipped.push({file, ...eligibility}); continue; }
    const target = Within(outputDir,'Texture/' + path.posix.dirname(item.file));
    const result = await Encode(projectDir,item,{format:rule.format==='auto'?(eligibility.compact ? ASSET_PUBLISH.opaqueColorFormat : ASSET_PUBLISH.textureFormat):rule.format,quality:rule.quality??(eligibility.compact ? ASSET_PUBLISH.opaqueColorQuality : ASSET_PUBLISH.quality),
      colorSpace: item.colorSpace, maxSize:rule.maxSize,textureType:rule.maxSize&&item.channel==='Normal'?'normal':'inherit'},target,{uastcRdo: ASSET_PUBLISH.uastcRdo});
    const encoded = await fs.readFile(Within(target,result.filename));
    const audit = InspectKtx(encoded,result.width,result.height,item.colorSpace);
    const unflipped = await fs.readFile(Within(target,result.unflipped)); InspectKtx(unflipped,result.width,result.height,item.colorSpace);
    if (rule.format==='auto' && !rule.maxSize && Math.max(encoded.length,unflipped.length) > source.length * ASSET_PUBLISH.maxTransferGrowth) {
      report.skipped.push({file:'Texture/' + item.file,reason:'transport-size guard: source retained',sourceBytes:source.length,candidateBytes:Math.max(encoded.length,unflipped.length)});
      for (const name of Names(result)) await fs.unlink(Within(target,name));
      Retain(file,'transport-size guard: source retained');
      log(`GPU candidate retained as source ${item.file}: ${source.length} -> ${encoded.length} bytes`);
      continue;
    }
    const Relative = name => path.posix.join(path.posix.dirname(item.file),name);
    const entry = {...result, output: Relative(result.filename), unflipped: Relative(result.unflipped), variants: {}, automatic: true};
    runtime[item.file] = entry; runtime[entry.output] = entry;
    Encoded(file,Names(result).map(name=>'Texture/'+Relative(name)));
    report.textures.push({file: 'Texture/' + item.file, output: 'Texture/' + entry.output, sourceBytes: source.length,
      sourceSha256: Hash(source), colorSpace: item.colorSpace, ...audit,
      unflipped: {output: 'Texture/' + entry.unflipped, bytes: unflipped.length, sha256: Hash(unflipped)}});
    log(`GPU texture ${item.file}: ${source.length} -> ${encoded.length} bytes`);
  }
  await fs.writeFile(runtimeFile, `export const TEXTURE_IMPORT_RUNTIME = ${JSON.stringify(runtime)};\n`);
  const modelRuntime = {};
  const work = await fs.mkdtemp(path.join(os.tmpdir(),'TengxianGpuPublish-'));
  try {
    await fs.mkdir(path.join(work,'Texture'));
    const externalRoles=new Map(), externalNormals=new Set(), imageResults=new Map();
    for(const file of inputs.filter(IsPublishModel)) {
      const source=await fs.readFile(Within(projectDir,file)), model=ReadPublishModel(source,file);
      const roles=GlbImageRoles(model.doc);
      const normals=NormalImages(model.doc);
      for(const [index,image] of (model.doc.images||[]).entries()) {
        const external=LocalModelImage(file,image.uri);if(!external)continue;
        const uses=externalRoles.get(external)||new Set();for(const role of roles.get(index)||[])uses.add(role);externalRoles.set(external,uses);
        if(normals.has(index))externalNormals.add(external);
      }
    }
    const EncodeImage=async(source,logicalFile,colorSpace,allowCompact,target,{orientations=[false],mipmaps=true,normal=false}={})=>{
      const rule=ResolvePathRule(pathRules,logicalFile);
      if(rule.format==='source')return {reason:rule.reason};
      const eligibility=await ImageEligibility(source,colorSpace,allowCompact);
      if(eligibility.reason && rule.format==='auto' && !rule.maxSize)return eligibility;
      const dimensions=ImportDimensions(eligibility.width,eligibility.height,rule.maxSize);
      if(dimensions.width%4||dimensions.height%4)throw Error('GPU path rule requires block-aligned output dimensions: '+logicalFile);
      const format=rule.format==='auto'?(eligibility.compact?ASSET_PUBLISH.opaqueColorFormat:ASSET_PUBLISH.textureFormat):rule.format;
      const imageFile=/\.glb$/i.test(logicalFile)?'Texture_EmbeddedImage.png':path.posix.basename(logicalFile).replace(/[^A-Za-z0-9_.-]/g,'_');
      await fs.writeFile(path.join(work,'Texture',imageFile),source);
      const result=await Encode(work,{file:imageFile,colorSpace,gpu:true,sampler:true},{format,quality:rule.quality??(eligibility.compact?ASSET_PUBLISH.opaqueColorQuality:ASSET_PUBLISH.quality),colorSpace,maxSize:rule.maxSize,mipmaps,textureType:rule.maxSize&&normal?'normal':'inherit'},target,{uastcRdo:ASSET_PUBLISH.uastcRdo,orientations});
      const bytes=await fs.readFile(Within(target,result.unflipped)), audit=InspectKtx(bytes,result.width,result.height,colorSpace,mipmaps);
      if(rule.format==='auto' && !rule.maxSize && bytes.length>source.length*ASSET_PUBLISH.maxTransferGrowth){
        for(const name of Names(result))await fs.unlink(Within(target,name));
        return {reason:'transport-size guard: source retained',sourceBytes:source.length,candidateBytes:bytes.length};
      }
      return {result,bytes,audit,format};
    };
    // Includes model-local external maps and new files absent from the manual inspector catalog.
    for(const file of inputs.filter(file=>!IsPublishModel(file) && coverage.get(file).status==='pending')) {
      if(!/\.(png|webp|jpe?g)$/i.test(file)){Retain(file,/\.bin$/i.test(file)?'geometry/CPU buffer retained byte-for-byte':'HDR, precompressed or non-raster dependency retains its source format');continue;}
      const source=await fs.readFile(Within(projectDir,file)), uses=externalRoles.get(file);
      if(uses?.size>1){Retain(file,'image shared between color and data slots');continue;}
      const colorSpace=uses?.size?[...uses][0]:/(?:normal|rough|metal|orm|mask|height|bump|occlusion|_ao)(?:[_.]|$)/i.test(file)?'linear':'srgb';
      const target=Within(outputDir,path.posix.dirname(file));
      const encoded=await EncodeImage(source,file,colorSpace,!/\/Character\/|(?:FirstPerson|Fps)/.test(file),target,{orientations:[true,false],normal:colorSpace==='linear'&&(externalNormals.has(file)||/normal(?:[_.]|$)/i.test(path.basename(file)))});
      if(encoded.reason){Retain(file,encoded.reason);report.skipped.push({file,...encoded});continue;}
      const {result,audit,format}=encoded, Relative=name=>path.posix.join(path.posix.dirname(file),name);
      const record={file,output:Relative(result.filename),sourceBytes:source.length,sourceSha256:Hash(source),colorSpace,...audit,
        bytes:(await fs.stat(Within(target,result.filename))).size,sha256:Hash(await fs.readFile(Within(target,result.filename))),
        unflipped:{output:Relative(result.unflipped),bytes:encoded.bytes.length,sha256:Hash(encoded.bytes)}};
      report.textures.push(record);
      const entry={...result,format,output:file.startsWith('Texture/')?record.output.slice(8):record.output,
        unflipped:file.startsWith('Texture/')?record.unflipped.output.slice(8):record.unflipped.output,
        publicationFile:file,publicationOutput:record.output,managedOnly:!file.startsWith('Texture/'),variants:{}};
      runtime[file.startsWith('Texture/')?file.slice(8):file]=entry;
      runtime[file.startsWith('Texture/')?record.output.slice(8):record.output]=entry;
      imageResults.set(file,{...encoded,output:record.unflipped.output});
      Encoded(file,Names(result).map(Relative));
      log(`GPU external texture ${file}: ${source.length} -> ${record.bytes} bytes`);
    }
    for (const file of inputs.filter(IsPublishModel)) {
      const source=await fs.readFile(Within(projectDir,file)),sourceGlb=ReadPublishModel(source,file),modelRule=ResolvePathRule(pathRules,file);
      if(modelRule.format==='source'){Retain(file,modelRule.reason);continue;}
      const roles = GlbImageRoles(sourceGlb.doc), doc = structuredClone(sourceGlb.doc);
      if((doc.bufferViews||[]).some(view=>view.extensions?.EXT_meshopt_compression)){Retain(file,'meshopt offsets require a dedicated repacker');continue;}
      const protectedViews=new Set((doc.accessors||[]).flatMap(accessor=>[accessor.bufferView,accessor.sparse?.indices?.bufferView,accessor.sparse?.values?.bufferView]).filter(Number.isInteger));
      for(const mesh of doc.meshes||[])for(const primitive of mesh.primitives||[]){const view=primitive.extensions?.KHR_draco_mesh_compression?.bufferView;if(Number.isInteger(view))protectedViews.add(view);}
      const chunks = /\.glb$/i.test(file)?(doc.bufferViews||[]).map((_,i) => View(sourceGlb,i)):null;
      const images = [], converted = new Set();
      for (const [index,image] of (doc.images || []).entries()) {
        const role = roles.get(index);
        const external=LocalModelImage(file,image.uri);
        if (!role || role.size !== 1 || (!external && (image.bufferView === undefined || !['image/png','image/jpeg','image/webp'].includes(image.mimeType)))) {
          report.skipped.push({file, image: index, reason: 'external, unused, mixed-color-space or unsupported image'}); continue;
        }
        if (image.bufferView!==undefined && doc.images.some((other,otherIndex) => otherIndex !== index && other.bufferView === image.bufferView)) {
          report.skipped.push({file,image:index,reason:'shared image buffer view: source retained'});continue;
        }
        const colorSpace = [...role][0];
        if(protectedViews.has(image.bufferView))throw Error('Image shares a geometry/animation buffer view: '+file);
        const mipmaps = doc.textures.some(texture => ImageOf(texture) === index && ![9728,9729].includes(doc.samplers?.[texture.sampler]?.minFilter));
        if(external) {
          const encoded=imageResults.get(external);
          if(!encoded){report.skipped.push({file,image:index,reason:coverage.get(external)?.reason||'external image retained'});continue;}
          image.uri=path.posix.relative(path.posix.dirname(file),encoded.output);delete image.bufferView;
          image.mimeType='image/ktx2';image.extras={...image.extras,publicationFormat:encoded.format};converted.add(index);
          images.push({index,colorSpace,sourceBytes:coverage.get(external).sourceBytes,...encoded.audit,externalOutput:encoded.output});
        } else {
          if(!chunks){report.skipped.push({file,image:index,reason:'buffer-view images in textual glTF retain their source'});continue;}
          const pixels=View(sourceGlb,image.bufferView), encoded=await EncodeImage(pixels,file,colorSpace,!/\/Character\/|(?:FirstPerson|Fps)/.test(file),path.join(work,'encoded'),{mipmaps,normal:NormalImages(sourceGlb.doc).has(index)});
          if(encoded.reason){report.skipped.push({file,image:index,...encoded});continue;}
          chunks[image.bufferView]=encoded.bytes;image.mimeType='image/ktx2';image.extras={...image.extras,publicationFormat:encoded.format};converted.add(index);
          images.push({index,colorSpace,sourceBytes:pixels.length,...encoded.audit});
        }
      }
      if (!images.length) {Retain(file,'no eligible GPU images; see per-image decisions');report.skipped.push({file,reason:'no eligible GPU images'});continue;}
      for (const texture of doc.textures || []) {
        const index = ImageOf(texture); if (!converted.has(index)) continue;
        texture.extensions = {...texture.extensions, KHR_texture_basisu: {source: index}};
        delete texture.extensions.EXT_texture_webp; delete texture.source;
      }
      const webpUsed = doc.textures.some(texture => texture.extensions?.EXT_texture_webp);
      for (const key of ['extensionsUsed','extensionsRequired']) doc[key] = [...new Set([...(doc[key] || []).filter(name => name !== 'EXT_texture_webp' || webpUsed),'KHR_texture_basisu'])];
      const encoded = chunks?PackGlb(doc,chunks):Buffer.from(JSON.stringify(doc)), readback = ReadPublishModel(encoded,file);
      const imageViews = new Set([...converted].map(index => doc.images[index].bufferView).filter(Number.isInteger));
      for (let index = 0; index < (chunks?.length||0); index++) if (!imageViews.has(index) && !View(sourceGlb,index).equals(View(readback,index))) throw Error('Non-image GLB bytes changed');
      for (const key of ['nodes','meshes','skins','animations','accessors','materials','scenes','cameras'])
        if (JSON.stringify(sourceGlb.doc[key]) !== JSON.stringify(readback.doc[key])) throw Error('GLB structure changed: ' + key);
      const output = file.replace(/\.(glb|gltf)$/i, (_all,extension)=>`_Gpu${Hash(encoded).slice(0,24)}.${extension.toLowerCase()}`);
      await fs.writeFile(Within(outputDir,output),encoded);
      modelRuntime[file] = output;
      Encoded(file,[output]);
      report.models.push({file,output,sourceBytes:source.length,bytes:encoded.length,sourceSha256:Hash(source),sha256:Hash(encoded),images});
      log(`GPU model ${file}: ${source.length} -> ${encoded.length} bytes (${images.length} images)`);
    }
  } finally {
    if (!path.resolve(work).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(work).startsWith('TengxianGpuPublish-')) throw Error('Unsafe temporary cleanup path');
    await fs.rm(work,{recursive:true,force:true});
  }
  await fs.writeFile(runtimeFile, `export const TEXTURE_IMPORT_RUNTIME = ${JSON.stringify(runtime)};\n`);
  if(report.coverage.some(row=>row.status==='pending'))throw Error('Unprocessed publication inputs');
  report.generated=[...generated].sort();
  await fs.writeFile(Within(outputDir,'Data_AssetPublishRuntime.mjs'),`export const ASSET_PUBLISH_RUNTIME = ${JSON.stringify(modelRuntime)};\n`);
  // 手机版贴图与模型（1024 + ASTC 6×6 / 法线 4×4）：另出一套，电脑端的产物与对照表不动。
  if (mobile) report.mobile = await BuildMobileAssets(projectDir, outputDir, {cacheDir, desktopRuntime: runtime, settings,
    textureFiles, modelFiles: mobileModelFiles, log});
  else await fs.writeFile(Within(outputDir,'Data_MobileAssetRuntime.mjs'),'export const MOBILE_ASSET_RUNTIME = {"textures":{},"models":{}};\n');
  // Source tools still use import maps. Give generated tables content stamps too,
  // rather than only relying on the game/menu bundle's stamp.
  const runtimeVersions = {};
  for(const file of ['Data_TextureImportRuntime.mjs','Data_AssetPublishRuntime.mjs','Data_MobileAssetRuntime.mjs'])
    runtimeVersions['./'+file] = './'+file+'?v='+BigInt('0x'+Hash(await fs.readFile(Within(outputDir,file))).slice(0,13)).toString();
  for(const item of await fs.readdir(outputDir,{withFileTypes:true})) {
    if(!item.isFile()||!item.name.endsWith('.html'))continue;
    const file=Within(outputDir,item.name),html=await fs.readFile(file,'utf8');
    const next=html.replace(/<script type="importmap">([\s\S]*?)<\/script>/,(all,body)=>{
      // 只改真正的 import map（JSON）。SceneEditor.html 自己没有表，是在脚本里用同一个正则去读
      // index.html 的表 —— 那一处匹配到的是 JS 源码，原样放过（它运行时读的就是这里盖过戳的 index.html）。
      let map;try{map=JSON.parse(body);}catch{return all;}
      if(!map?.imports)return all;
      Object.assign(map.imports,runtimeVersions);
      return '<script type="importmap">'+JSON.stringify(map)+'</script>';
    });
    if(next!==html)await fs.writeFile(file,next);
  }
  report.summary = {textures: report.textures.length,models: report.models.length,
    sourceBytes: [...report.textures,...report.models].reduce((n,r)=>n+r.sourceBytes,0),
    bytes: [...report.textures,...report.models].reduce((n,r)=>n+r.bytes,0),
    rgbaBytes: [...report.textures,...report.models.flatMap(m=>m.images.filter(image=>!image.externalOutput))].reduce((n,r)=>n+r.rgbaBytes,0),
    gpuBytes: [...report.textures,...report.models.flatMap(m=>m.images.filter(image=>!image.externalOutput))].reduce((n,r)=>n+r.gpuBytes,0)};
  await fs.writeFile(Within(outputDir,'Data_AssetPublishReport.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const Arg = key => {const i=process.argv.indexOf(key);return i<0?null:process.argv[i+1];};
  if (!Arg('--output-dir')) throw Error('Required: --output-dir <staging>/Taierzhuang1938');
  const report=await BuildPublishAssets(ownDir,Arg('--output-dir'),{cacheDir:Arg('--cache-dir'),mobile:!process.argv.includes('--desktop-only')});
  console.log(JSON.stringify({summary:report.summary,cache:report.cache,skipped:report.skipped.length}));
}
