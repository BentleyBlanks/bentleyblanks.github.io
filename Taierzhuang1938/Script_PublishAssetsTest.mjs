import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {BuildPublishAssets,GlbImageRoles,InspectKtx} from './Script_BuildPublishAssets.mjs';
import {ValidatePublishAssets} from './Script_ValidatePublishAssets.mjs';
import {Within,Hash} from './Script_PublishCache.mjs';

assert.throws(()=>Within('C:/scope','../outside'),/outside/);
const roles=GlbImageRoles({images:[{}],textures:[{source:0}],materials:[{normalTexture:{index:0},pbrMetallicRoughness:{baseColorTexture:{index:0}}}]});
assert.equal(roles.get(0).size,2,'shared color/data images cannot be silently retagged');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'TengxianPublishTest-'));
try{
 const source=path.join(temporary,'source'),out=path.join(temporary,'out'),cache=path.join(temporary,'cache');
 await fs.mkdir(path.join(source,'Texture'),{recursive:true});await fs.mkdir(path.join(out,'Texture'),{recursive:true});
 for(const file of ['Script_TextureImportBuild.mjs','Script_TextureImportPixels.mjs','Script_TextureImportRules.mjs'])await fs.copyFile(new URL(file,import.meta.url),path.join(source,file));
 await fs.writeFile(path.join(source,'Data_TextureImportSettings.json'),'{"version":1,"textures":{}}');
 await fs.writeFile(path.join(out,'index.html'),'<script type="importmap">{"imports":{}}</script>');
 const file='Texture_WeaponSteelV2Base.webp',width=128,height=128,data=Buffer.alloc(width*height*4);
 let seed=1938;for(let i=0;i<data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed&255;data[i+1]=(seed>>>8)&255;data[i+2]=(seed>>>16)&255;data[i+3]=255;}
 const pixels=await sharp(data,{raw:{width,height,channels:4}}).webp({lossless:true}).toBuffer();
 await fs.writeFile(path.join(source,'Texture',file),pixels);await fs.writeFile(path.join(out,'Texture',file),pixels);
 const options={cacheDir:cache,textureFiles:[file],modelFiles:[],log:()=>{}};
 const before=Hash(pixels),cold=await BuildPublishAssets(source,out,options);
 assert.equal(cold.textures.length,1,'the ordinary GPU path publishes eligible same-size texture data');
 assert.ok(cold.cache.misses>0);assert.equal(cold.cache.hits,0);
 assert.equal(Hash(await fs.readFile(path.join(source,'Texture',file))),before,'never rewrite source');
 await ValidatePublishAssets(source,out);
 const runtime=await fs.readFile(path.join(out,'Data_TextureImportRuntime.mjs'),'utf8');
 const warm=await BuildPublishAssets(source,out,options);
 assert.equal(warm.cache.misses,0);assert.ok(warm.cache.hits>0);
 assert.equal(await fs.readFile(path.join(out,'Data_TextureImportRuntime.mjs'),'utf8'),runtime,'cache diagnostics never change runtime content stamps');
 const entry=JSON.parse(runtime.match(/=\s*([\s\S]*);\s*$/)[1])[file];
 const encoded=await fs.readFile(path.join(out,'Texture',entry.output));
 assert.deepEqual([entry.width,entry.height],[width,height]);
 assert.equal(InspectKtx(encoded,width,height,'srgb').gpuBytes,10936);
 assert.throws(()=>InspectKtx(encoded,width/2,height),/dimensions/);
 assert.throws(()=>InspectKtx(encoded,width,height,'linear'),/color space|codec/);
 const entries=await fs.readdir(cache);await fs.writeFile(path.join(cache,entries[0],entry.filename),'corrupt');
 const rebuilt=await BuildPublishAssets(source,out,options);assert.equal(rebuilt.cache.misses,1,'corrupt cached bytes are rebuilt');
 assert.equal(Hash(await fs.readFile(path.join(out,'Texture',entry.output))),Hash(encoded));
 // Explicit source settings override automatic GPU policy without changing source pixels.
 await fs.writeFile(path.join(source,'Data_TextureImportSettings.json'),JSON.stringify({version:1,textures:{[file]:{format:'source'}}}));
 const explicit=await BuildPublishAssets(source,out,options);assert.equal(explicit.textures.length,0);assert.ok(explicit.skipped.some(row=>row.reason.includes('explicit')));
 assert.equal(Hash(await fs.readFile(path.join(source,'Texture',file))),before);
 console.log('PASS PublishAssets: dimension/color-space gates, ordinary GPU output, source protection, stable warm cache, corrupt-cache recovery and explicit overrides');
}finally{
 if(!path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(temporary).startsWith('TengxianPublishTest-'))throw Error('Unsafe cleanup');
 await fs.rm(temporary,{recursive:true,force:true});
}
