// One publish-only entry: explicit importer settings, automatic GPU textures, embedded GLB images.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {ASSET_PUBLISH} from './Data_AssetPublish.mjs';
import {TextureCatalog, NormalizeImportSettings} from './Script_TextureImportRules.mjs';
import {EncodeTexture} from './Script_TextureImportBuild.mjs';
import {BuildTextureImports} from './Script_BuildTextureImports.mjs';
import {CachedFiles, Hash, Within} from './Script_PublishCache.mjs';
import {read as ReadKtx} from './vendor/three/examples/jsm/libs/ktx-parse.module.js';

const require = createRequire(import.meta.url);
const ownDir = path.dirname(fileURLToPath(import.meta.url));
const Toolchain = async project => ({sharp: sharp.versions, basis: require('@gpu-tex-enc/basis/package.json').version,
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
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB');
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(24 + length) !== 0x004e4942) throw Error('Invalid GLB chunks');
  return {doc: JSON.parse(bytes.subarray(20,20 + length).toString()), bin: bytes.subarray(28 + length)};
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
        const color = ['baseColorTexture','emissiveTexture','specularColorTexture','sheenColorTexture'].includes(key);
        const role = color ? 'srgb' : 'linear';
        const entry = roles.get(index) || new Set(); entry.add(role); roles.set(index, entry);
      } else Visit(child);
    }
  };
  for (const material of doc.materials || []) Visit(material);
  return roles;
}
export async function BuildPublishAssets(projectDir, outputDir, {cacheDir = null, textureFiles = null, modelFiles = null, log = console.log} = {}) {
  projectDir = path.resolve(projectDir); outputDir = path.resolve(outputDir);
  if (projectDir === outputDir) throw Error('Publish assets require a separate staging directory');
  const toolchain = await Toolchain(projectDir), stats = {hits: 0, misses: 0};
  const report = {version: 1, policy: ASSET_PUBLISH, toolchain, textures: [], models: [], skipped: [], cache: stats};
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
  for (const item of TextureCatalog()) {
    if (textureFiles && !textureFiles.includes(item.file)) continue;
    if (settings.textures[item.file]) { report.skipped.push({file: 'Texture/' + item.file, reason: 'explicit importer configuration takes precedence'}); continue; }
    if (!item.gpu || item.tier === 'offline') { report.skipped.push({file: 'Texture/' + item.file, reason: item.restriction || 'offline source'}); continue; }
    const source = await fs.readFile(Within(projectDir,'Texture/' + item.file));
    const eligibility = await ImageEligibility(source,item.colorSpace,item.kind === 'material');
    if (eligibility.reason) { report.skipped.push({file: 'Texture/' + item.file, ...eligibility}); continue; }
    const target = Within(outputDir,'Texture/' + path.posix.dirname(item.file));
    const result = await Encode(projectDir,item,{format: eligibility.compact ? ASSET_PUBLISH.opaqueColorFormat : ASSET_PUBLISH.textureFormat, quality: eligibility.compact ? ASSET_PUBLISH.opaqueColorQuality : ASSET_PUBLISH.quality,
      colorSpace: item.colorSpace, maxSize: 0},target,{uastcRdo: ASSET_PUBLISH.uastcRdo});
    const encoded = await fs.readFile(Within(target,result.filename));
    const audit = InspectKtx(encoded,eligibility.width,eligibility.height,item.colorSpace);
    const unflipped = await fs.readFile(Within(target,result.unflipped)); InspectKtx(unflipped,eligibility.width,eligibility.height,item.colorSpace);
    if (Math.max(encoded.length,unflipped.length) > source.length * ASSET_PUBLISH.maxTransferGrowth) {
      report.skipped.push({file:'Texture/' + item.file,reason:'transport-size guard: source retained',sourceBytes:source.length,candidateBytes:Math.max(encoded.length,unflipped.length)});
      for (const name of Names(result)) await fs.unlink(Within(target,name));
      log(`GPU candidate retained as source ${item.file}: ${source.length} -> ${encoded.length} bytes`);
      continue;
    }
    const Relative = name => path.posix.join(path.posix.dirname(item.file),name);
    const entry = {...result, output: Relative(result.filename), unflipped: Relative(result.unflipped), variants: {}, automatic: true};
    runtime[item.file] = entry; runtime[entry.output] = entry;
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
    for (const file of modelFiles || ASSET_PUBLISH.models) {
      if (!ASSET_PUBLISH.models.includes(file)) throw Error('Model not registered for GPU publication: ' + file);
      const source = await fs.readFile(Within(projectDir,file)), sourceGlb = ReadGlb(source);
      const roles = GlbImageRoles(sourceGlb.doc), doc = structuredClone(sourceGlb.doc);
      if(doc.bufferViews.some(view=>view.extensions?.EXT_meshopt_compression))throw Error('Meshopt buffer offsets require a dedicated repacker: '+file);
      const protectedViews=new Set((doc.accessors||[]).flatMap(accessor=>[accessor.bufferView,accessor.sparse?.indices?.bufferView,accessor.sparse?.values?.bufferView]).filter(Number.isInteger));
      for(const mesh of doc.meshes||[])for(const primitive of mesh.primitives||[]){const view=primitive.extensions?.KHR_draco_mesh_compression?.bufferView;if(Number.isInteger(view))protectedViews.add(view);}
      const chunks = doc.bufferViews.map((_,i) => View(sourceGlb,i));
      const images = [], converted = new Set();
      for (const [index,image] of (doc.images || []).entries()) {
        const role = roles.get(index);
        if (!role || role.size !== 1 || image.bufferView === undefined || !['image/png','image/jpeg','image/webp'].includes(image.mimeType)) {
          report.skipped.push({file, image: index, reason: 'external, unused, mixed-color-space or unsupported image'}); continue;
        }
        if (doc.images.some((other,otherIndex) => otherIndex !== index && other.bufferView === image.bufferView)) {
          report.skipped.push({file,image:index,reason:'shared image buffer view: source retained'});continue;
        }
        const colorSpace = [...role][0], pixels = View(sourceGlb,image.bufferView);
        if(protectedViews.has(image.bufferView))throw Error('Image shares a geometry/animation buffer view: '+file);
        // Character and first-person color maps use the same conservative path as data maps.
        const eligibility = await ImageEligibility(pixels,colorSpace,!/\/Character\/|(?:FirstPerson|Fps)/.test(file));
        if (eligibility.reason) {report.skipped.push({file,image:index,...eligibility});continue;}
        const imageFile = 'Texture_EmbeddedImage.png';
        await fs.writeFile(path.join(work,'Texture',imageFile),pixels);
        const item = {file: imageFile, colorSpace, gpu: true, sampler: true};
        const target = path.join(work,'encoded');
        const mipmaps = doc.textures.some(texture => ImageOf(texture) === index && ![9728,9729].includes(doc.samplers?.[texture.sampler]?.minFilter));
        const result = await Encode(work,item,{format: eligibility.compact ? ASSET_PUBLISH.opaqueColorFormat : ASSET_PUBLISH.textureFormat, quality: eligibility.compact ? ASSET_PUBLISH.opaqueColorQuality : ASSET_PUBLISH.quality,
          colorSpace, maxSize: 0, mipmaps},target,{uastcRdo: ASSET_PUBLISH.uastcRdo, orientations:[false]});
        const bytes = await fs.readFile(Within(target,result.unflipped));
        const audit = InspectKtx(bytes,eligibility.width,eligibility.height,colorSpace,mipmaps);
        if (bytes.length > pixels.length * ASSET_PUBLISH.maxTransferGrowth) {
          report.skipped.push({file,image:index,reason:'transport-size guard: source retained',sourceBytes:pixels.length,candidateBytes:bytes.length});continue;
        }
        chunks[image.bufferView] = bytes; image.mimeType = 'image/ktx2'; converted.add(index);
        images.push({index, colorSpace, sourceBytes: pixels.length, ...audit});
      }
      if (!images.length) {report.skipped.push({file,reason:'no eligible embedded GPU images'});continue;}
      for (const texture of doc.textures || []) {
        const index = ImageOf(texture); if (!converted.has(index)) continue;
        texture.extensions = {...texture.extensions, KHR_texture_basisu: {source: index}};
        delete texture.extensions.EXT_texture_webp; delete texture.source;
      }
      const webpUsed = doc.textures.some(texture => texture.extensions?.EXT_texture_webp);
      for (const key of ['extensionsUsed','extensionsRequired']) doc[key] = [...new Set([...(doc[key] || []).filter(name => name !== 'EXT_texture_webp' || webpUsed),'KHR_texture_basisu'])];
      const encoded = PackGlb(doc,chunks), readback = ReadGlb(encoded);
      const imageViews = new Set([...converted].map(index => doc.images[index].bufferView));
      for (let index = 0; index < chunks.length; index++) if (!imageViews.has(index) && !View(sourceGlb,index).equals(View(readback,index))) throw Error('Non-image GLB bytes changed');
      for (const key of ['nodes','meshes','skins','animations','accessors','materials','scenes','cameras'])
        if (JSON.stringify(sourceGlb.doc[key]) !== JSON.stringify(readback.doc[key])) throw Error('GLB structure changed: ' + key);
      const output = file.replace(/\.glb$/, `_Gpu${Hash(encoded).slice(0,24)}.glb`);
      await fs.writeFile(Within(outputDir,output),encoded);
      modelRuntime[file] = output;
      report.models.push({file,output,sourceBytes:source.length,bytes:encoded.length,sourceSha256:Hash(source),sha256:Hash(encoded),images});
      log(`GPU model ${file}: ${source.length} -> ${encoded.length} bytes (${images.length} images)`);
    }
  } finally {
    if (!path.resolve(work).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(work).startsWith('TengxianGpuPublish-')) throw Error('Unsafe temporary cleanup path');
    await fs.rm(work,{recursive:true,force:true});
  }
  await fs.writeFile(Within(outputDir,'Data_AssetPublishRuntime.mjs'),`export const ASSET_PUBLISH_RUNTIME = ${JSON.stringify(modelRuntime)};\n`);
  // Source tools still use import maps. Give generated tables content stamps too,
  // rather than only relying on the game/menu bundle's stamp.
  const runtimeVersions = {};
  for(const file of ['Data_TextureImportRuntime.mjs','Data_AssetPublishRuntime.mjs'])
    runtimeVersions['./'+file] = './'+file+'?v='+BigInt('0x'+Hash(await fs.readFile(Within(outputDir,file))).slice(0,13)).toString();
  for(const item of await fs.readdir(outputDir,{withFileTypes:true})) {
    if(!item.isFile()||!item.name.endsWith('.html'))continue;
    const file=Within(outputDir,item.name),html=await fs.readFile(file,'utf8');
    const next=html.replace(/<script type="importmap">([\s\S]*?)<\/script>/,(_all,body)=>{
      const map=JSON.parse(body);Object.assign(map.imports,runtimeVersions);
      return '<script type="importmap">'+JSON.stringify(map)+'</script>';
    });
    if(next!==html)await fs.writeFile(file,next);
  }
  report.summary = {textures: report.textures.length,models: report.models.length,
    sourceBytes: [...report.textures,...report.models].reduce((n,r)=>n+r.sourceBytes,0),
    bytes: [...report.textures,...report.models].reduce((n,r)=>n+r.bytes,0),
    rgbaBytes: [...report.textures,...report.models.flatMap(m=>m.images)].reduce((n,r)=>n+r.rgbaBytes,0),
    gpuBytes: [...report.textures,...report.models.flatMap(m=>m.images)].reduce((n,r)=>n+r.gpuBytes,0)};
  await fs.writeFile(Within(outputDir,'Data_AssetPublishReport.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const Arg = key => {const i=process.argv.indexOf(key);return i<0?null:process.argv[i+1];};
  if (!Arg('--output-dir')) throw Error('Required: --output-dir <staging>/Taierzhuang1938');
  const report=await BuildPublishAssets(ownDir,Arg('--output-dir'),{cacheDir:Arg('--cache-dir')});
  console.log(JSON.stringify({summary:report.summary,cache:report.cache,skipped:report.skipped.length}));
}
