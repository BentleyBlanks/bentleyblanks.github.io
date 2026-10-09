import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {ParseParticleVolume} from './Script_ParticleVolumeAsset.mjs';
import {PARTICLE_VOLUME_ASSETS} from './Data_ParticleVolumeAssets.mjs';
import {NormalizeParticleModules} from './Script_ParticleModules.mjs';
for(const id of Object.keys(PARTICLE_VOLUME_ASSETS)){
 const file=path.join(import.meta.dirname,'Volume','Volume_'+id+'.bin.gz'),bytes=await fs.readFile(file),decoded=new Uint8Array(gunzipSync(bytes));
 const {metadata:m,size,data}=ParseParticleVolume(decoded),report=JSON.parse(await fs.readFile(path.join(import.meta.dirname,'Volume','Data_'+id+'Volume.json'),'utf8'));
 assert.equal(m.asset,id);assert.equal(m.license,'CC0-1.0');assert.equal(report.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(report.gpuBytes,data.byteLength);assert.ok(size.every(n=>n<=2048));assert.ok(m.anchor.every(n=>Number.isFinite(n)&&n>=0&&n<=1));
 assert.ok(m.sourceFrameIndices.every((n,i,a)=>i===0||n>a[i-1]));assert.ok(m.frames>=48);assert.ok(data.some(n=>n>32));assert.ok(m.duration>1&&m.duration<10);
 assert.throws(()=>ParseParticleVolume(decoded.subarray(0,decoded.length-1)),/payload/);
 console.log(id,JSON.stringify({frames:m.frames,size,gpuMiB:data.byteLength/1048576,transferMiB:bytes.length/1048576}));
}
assert.throws(()=>NormalizeParticleModules({renderer:{volumeAsset:'Unknown'}}),/volumeAsset/);
assert.throws(()=>NormalizeParticleModules({renderer:{volumeSpeed:-1}}),/volumeSpeed/);
assert.throws(()=>NormalizeParticleModules({renderer:{volumeLoop:1}}),/volumeLoop/);
console.log('ok volume source license, rebuilt payload hashes, dimensions, timeline and input validation');
