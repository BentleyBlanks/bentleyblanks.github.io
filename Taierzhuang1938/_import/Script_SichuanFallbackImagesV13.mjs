import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadSharp,readGlb,viewBytes} from './Script_SichuanQualityPackageV12.mjs';
const args=process.argv.slice(2),mode=args[0],file=path.resolve(args[1]),directory=path.resolve(args[2]);
const {sharp}=loadSharp(),hash=b=>createHash('sha256').update(b).digest('hex');
const evidence=p=>{const b=fs.readFileSync(p);return{path:path.resolve(p),bytes:b.length,sha256:hash(b)}};
fs.mkdirSync(directory,{recursive:true});
if(mode==='prepare'){
 const projection=JSON.parse(fs.readFileSync(file,'utf8')),high=readGlb(projection.sourceHighRuntime.path),g=high.document,roles={};
 function walk(id,role){const n=g.nodes[id];if(projection.partSubset.includes(n.name))role=n.name;if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){const m=g.materials[p.material],infos={Base:m.pbrMetallicRoughness.baseColorTexture,Orm:m.pbrMetallicRoughness.metallicRoughnessTexture,Normal:m.normalTexture};for(const [channel,info]of Object.entries(infos)){const t=g.textures[info.index],i=t.source??t.extensions.EXT_texture_webp.source;roles[role+':'+channel]=i;}}for(const c of n.children??[])walk(c,role);}
 for(const n of g.scenes[g.scene??0].nodes)walk(n,null);
 const report={generator:'SichuanFallbackImageInputsV13',projection:evidence(file),sourceHighRuntime:projection.sourceHighRuntime,resolution:4096,parts:{}};
 for(const role of projection.partSubset){report.parts[role]={high:{},low:{}};for(const channel of ['Base','Orm','Normal'])for(const kind of ['high','low']){
   const source=kind==='high'?viewBytes(high,g.images[roles[role+':'+channel]].bufferView):fs.readFileSync(projection.atlases[role].images[channel].path);
   const {data,info}=await sharp(source).ensureAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
   if(info.width!==4096||info.height!==4096||info.channels!==4)throw Error('Unexpected fallback input dimensions');
   const target=path.join(directory,`${kind}_${role}_${channel}.rgba`);fs.writeFileSync(target,data);
   report.parts[role][kind][channel]={...evidence(target),width:4096,height:4096,channels:4,sourceImageSha256:hash(source),rowOrder:'PNG top row first',encoding:channel==='Base'?'sRGB8':'linear8'};
 }}
 fs.writeFileSync(path.join(directory,'Data_FallbackImageInputsV13.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({prepared:true,parts:Object.keys(report.parts)}));
}else if(mode==='encode'){
 const report=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const [role,row]of Object.entries(report.parts))for(const channel of ['Base','Orm','Normal']){
   const raw=row.outputs[channel],data=fs.readFileSync(raw.path);if(hash(data)!==raw.sha256)throw Error('Fallback RGBA changed');
   const target=path.join(directory,`Texture_ProjectedV13_${role}_${channel}.png`);
   await sharp(data,{raw:{width:4096,height:4096,channels:4}}).png({compressionLevel:6}).toFile(target);
   const decoded=await sharp(target).ensureAlpha().raw({depth:'uchar'}).toBuffer();if(!decoded.equals(data))throw Error('PNG encoding changed sampled pixels');
   row.outputs[channel]={...raw,...evidence(target),rawRgba8:{path:raw.path,bytes:raw.bytes,sha256:raw.sha256},width:4096,height:4096,colourSpace:channel==='Base'?'sRGB':'Non-Color',decodedRgba8Sha256:raw.sha256,rgbaRoundtripExact:true};
 }
 report.imagesEncoded=true;fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({encoded:true,parts:Object.keys(report.parts)}));
}else throw Error('Use prepare <projection.json> <cacheDir> or encode <fallback.json> <pngDir>');
