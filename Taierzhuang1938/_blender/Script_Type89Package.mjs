// Lossless RGB packaging for this opaque-material/transmission asset only.
// Diagnostic bake alpha is not material opacity. Raw RGBA source maps remain in
// the external editable projects; runtime RGB bytes and dimensions are exact.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ReadGlb,GeometryHash} from '../_import/Script_CompressEmbeddedTextures.mjs';

const project=path.resolve(import.meta.dirname,'..');
const target=path.join(project,'Model/Type89MediumTank/Model_Type89MediumTank.glb');
const Hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function Pack(doc,bin){
  const json=Buffer.from(JSON.stringify(doc));const padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);
  const output=Buffer.alloc(28+padded.length+bin.length);output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(padded.length,12);output.writeUInt32LE(0x4e4f534a,16);padded.copy(output,20);output.writeUInt32LE(bin.length,20+padded.length);output.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(output,28+padded.length);return output;
}
const bytes=await fs.readFile(target),original=ReadGlb(bytes),doc=structuredClone(original.doc);
if(!doc.materials.every(material=>(material.alphaMode??'OPAQUE')==='OPAQUE'&&(material.pbrMetallicRoughness?.baseColorFactor?.[3]??1)===1))throw Error('This RGB-only packer must not touch an alpha material');
const replacements=new Map(),rows=[];
for(const [index,image]of doc.images.entries()){
  const view=original.doc.bufferViews[image.bufferView],encoded=original.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const source=await sharp(encoded).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const png=await sharp(source.data,{raw:{width:source.info.width,height:source.info.height,channels:3}}).png({compressionLevel:9}).toBuffer();
  const webp=await sharp(source.data,{raw:{width:source.info.width,height:source.info.height,channels:3}}).webp({lossless:true,effort:6}).toBuffer();
  const output=webp.length<png.length?webp:png;
  const decoded=await sharp(output).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(!decoded.data.equals(source.data)||decoded.info.width!==source.info.width||decoded.info.height!==source.info.height)throw Error('RGB or resolution changed');
  image.mimeType=output===webp?'image/webp':'image/png';replacements.set(image.bufferView,output);
  for(const texture of doc.textures){const imageIndex=texture.source??texture.extensions?.EXT_texture_webp?.source;if(imageIndex!==index)continue;if(image.mimeType==='image/webp'){texture.extensions={...texture.extensions,EXT_texture_webp:{source:index}};delete texture.source;}else{texture.source=index;if(texture.extensions)delete texture.extensions.EXT_texture_webp;}}
  rows.push({index,width:source.info.width,height:source.info.height,sourceBytes:encoded.length,runtimeBytes:output.length,mime:image.mimeType,rgbSha256:Hash(source.data),unusedAlphaRemoved:true});
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
const report={version:1,method:'Unused diagnostic alpha removed only for opaque materials; original RGB and resolution retained exactly; lossless WebP or PNG',beforeBytes:bytes.length,afterBytes:output.length,sourceSha256:Hash(bytes),runtimeSha256:Hash(output),geometrySha256:GeometryHash(ReadGlb(output)),images:rows};
await fs.writeFile(path.join(project,'Model/Type89MediumTank/Data_TexturePacking.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({beforeBytes:bytes.length,afterBytes:output.length,images:rows.length,rgbExact:true,geometryExact:true}));
