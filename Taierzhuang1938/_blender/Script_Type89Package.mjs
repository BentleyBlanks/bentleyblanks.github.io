// Lossless packaging for Type89 only. Opacity-bearing base maps retain RGBA;
// other images may discard unused diagnostic alpha. Source maps stay external.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ReadGlb,GeometryHash} from '../_import/Script_CompressEmbeddedTextures.mjs';

const project=path.resolve(import.meta.dirname,'..');
const fileArgument=process.argv.find(value=>value.startsWith('--file='))?.slice(7);
const target=fileArgument?path.resolve(fileArgument):path.join(project,'Model/Type89MediumTank/Model_Type89MediumTank.glb');
if(!target.includes('Type89MediumTank')||!target.toLowerCase().endsWith('.glb'))throw Error('Type89 packer target must be this asset GLB');
const auditFile=fileArgument?path.join(path.dirname(target),'Data_TexturePackingProbe.json'):path.join(project,'Model/Type89MediumTank/Data_TexturePacking.json');
const Hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function Pack(doc,bin){
  const json=Buffer.from(JSON.stringify(doc));const padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);
  const output=Buffer.alloc(28+padded.length+bin.length);output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(padded.length,12);output.writeUInt32LE(0x4e4f534a,16);padded.copy(output,20);output.writeUInt32LE(bin.length,20+padded.length);output.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(output,28+padded.length);return output;
}
const bytes=await fs.readFile(target),original=ReadGlb(bytes),doc=structuredClone(original.doc);
const alphaImages=new Set();
for(const material of doc.materials){
  if((material.alphaMode??'OPAQUE')==='OPAQUE'&&(material.pbrMetallicRoughness?.baseColorFactor?.[3]??1)===1)continue;
  const index=material.pbrMetallicRoughness?.baseColorTexture?.index;
  if(index!==undefined){const texture=doc.textures[index];alphaImages.add(texture.source??texture.extensions?.EXT_texture_webp?.source);}
}
const replacements=new Map(),rows=[];
for(const [index,image]of doc.images.entries()){
  const view=original.doc.bufferViews[image.bufferView],encoded=original.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const keepAlpha=alphaImages.has(index);
  const source=await (keepAlpha?sharp(encoded).ensureAlpha():sharp(encoded).removeAlpha()).raw().toBuffer({resolveWithObject:true});
  const png=await sharp(source.data,{raw:{width:source.info.width,height:source.info.height,channels:source.info.channels}}).png({compressionLevel:9}).toBuffer();
  const webp=await sharp(source.data,{raw:{width:source.info.width,height:source.info.height,channels:source.info.channels}}).webp({lossless:true,effort:6}).toBuffer();
  let output;
  for(const candidate of [webp,png].sort((a,b)=>a.length-b.length)){
    const decoded=await (keepAlpha?sharp(candidate).ensureAlpha():sharp(candidate).removeAlpha()).raw().toBuffer({resolveWithObject:true});
    if(decoded.data.equals(source.data)&&decoded.info.width===source.info.width&&decoded.info.height===source.info.height){output=candidate;break;}
  }
  if(!output)throw Error('No exact RGB/RGBA encoding candidate');
  image.mimeType=output===webp?'image/webp':'image/png';replacements.set(image.bufferView,output);
  for(const texture of doc.textures){const imageIndex=texture.source??texture.extensions?.EXT_texture_webp?.source;if(imageIndex!==index)continue;if(image.mimeType==='image/webp'){texture.extensions={...texture.extensions,EXT_texture_webp:{source:index}};delete texture.source;}else{texture.source=index;if(texture.extensions)delete texture.extensions.EXT_texture_webp;}}
  rows.push({index,width:source.info.width,height:source.info.height,sourceBytes:encoded.length,runtimeBytes:output.length,mime:image.mimeType,pixelSha256:Hash(source.data),channels:source.info.channels,unusedAlphaRemoved:!keepAlpha,opacityPreserved:keepAlpha});
}
for(const key of ['extensionsUsed','extensionsRequired'])doc[key]=[...new Set([...(doc[key]??[]),'EXT_texture_webp'])];
const buffers=[];let offset=0;
for(const [index,view]of doc.bufferViews.entries()){
  const old=original.doc.bufferViews[index],payload=replacements.get(index)??original.bin.subarray(old.byteOffset??0,(old.byteOffset??0)+old.byteLength);
  const padded=Buffer.alloc(Math.ceil(payload.length/4)*4);payload.copy(padded);view.byteOffset=offset;view.byteLength=payload.length;buffers.push(padded);offset+=padded.length;
}
doc.buffers[0].byteLength=offset;
const output=Pack(doc,Buffer.concat(buffers));
if(GeometryHash(ReadGlb(output))!==GeometryHash(original))throw Error('Non-image buffers changed');
for(const key of ['nodes','meshes','skins','animations','scenes','accessors'])if(JSON.stringify(doc[key])!==JSON.stringify(original.doc[key]))throw Error('Articulation/geometry changed: '+key);
await fs.writeFile(target,output);
const report={version:2,method:'Opaque image RGB remains exact; alpha-bearing base images retain exact RGBA and resolution; lossless WebP or PNG',beforeBytes:bytes.length,afterBytes:output.length,sourceSha256:Hash(bytes),runtimeSha256:Hash(output),geometrySha256:GeometryHash(ReadGlb(output)),images:rows};
await fs.writeFile(auditFile,JSON.stringify(report,null,2)+'\n');
if(!fileArgument){
  const sourceExports='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank/Exports';
  try{if((await fs.stat(sourceExports)).isDirectory())await fs.copyFile(target,path.join(sourceExports,'Model_Type89MediumTankGamePbr.glb'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
console.log(JSON.stringify({beforeBytes:bytes.length,afterBytes:output.length,images:rows.length,rgbExact:true,opacityImagesExact:alphaImages.size,geometryExact:true}));
