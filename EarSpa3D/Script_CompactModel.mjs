// Runtime binds its own generated PBR textures. Remove only redundant legacy texture payloads.
import fs from 'node:fs/promises';
const path=new URL('./Models/Model_ImmersiveEar.glb',import.meta.url),bytes=await fs.readFile(path);
const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength)),bin=bytes.subarray(28+jsonLength);
if(!json.images?.length){console.log('Model already compact');process.exit(0);}
const imageViews=new Set(json.images.map(i=>i.bufferView));
for(const material of json.materials||[]){delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;}
const remap=new Map(),parts=[],views=[];let offset=0;
for(const [index,view] of json.bufferViews.entries()){
 if(imageViews.has(index))continue;remap.set(index,views.length);const data=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);parts.push(data);const pad=(4-data.length%4)%4;if(pad)parts.push(Buffer.alloc(pad));views.push({...view,byteOffset:offset});offset+=data.length+pad;
}
for(const accessor of json.accessors){if(accessor.bufferView!==undefined)accessor.bufferView=remap.get(accessor.bufferView);if(accessor.sparse){accessor.sparse.indices.bufferView=remap.get(accessor.sparse.indices.bufferView);accessor.sparse.values.bufferView=remap.get(accessor.sparse.values.bufferView);}}
json.bufferViews=views;json.buffers=[{byteLength:offset}];delete json.images;delete json.textures;delete json.samplers;
const text=Buffer.from(JSON.stringify(json)),padding=(4-text.length%4)%4,jsonBuffer=Buffer.concat([text,Buffer.alloc(padding,32)]),binBuffer=Buffer.concat(parts),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonBuffer.length+binBuffer.length,8);jh.writeUInt32LE(jsonBuffer.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binBuffer.length,0);bh.writeUInt32LE(0x004e4942,4);
await fs.writeFile(path,Buffer.concat([header,jh,jsonBuffer,bh,binBuffer]));console.log('Compacted model '+bytes.length+' -> '+header.readUInt32LE(8)+' bytes; actual runtime PBR unchanged');
