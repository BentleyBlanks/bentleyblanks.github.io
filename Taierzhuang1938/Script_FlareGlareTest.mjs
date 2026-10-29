import assert from 'node:assert/strict';
import {FLARE_GLARE as G} from './Data_Tuning_FlareEffects.mjs';
import {FlareGlareIncident,FlareGlareProfile} from './Script_FlareGlare.mjs';
import * as THREE from 'three';
import {LensFlarePass} from './Script_PostLensFlare.mjs';
const source={position:{x:0,y:0,z:0},currentIntensity:90000,color:{r:1,g:1,b:1}};
const near=FlareGlareIncident(source,{x:0,y:0,z:100}),far=FlareGlareIncident(source,{x:0,y:0,z:200});
assert.deepEqual(near,[9,9,9]);assert.deepEqual(far,[2.25,2.25,2.25]);
assert.deepEqual(FlareGlareIncident({...source,currentIntensity:180000},{x:0,y:0,z:100}),[18,18,18]);
const directed={...source,emission:{direction:{x:0,y:-1,z:0},floor:.7,power:1.2}};
assert.ok(Math.abs(FlareGlareIncident(directed,{x:0,y:100,z:0})[0]/FlareGlareIncident(directed,{x:0,y:-100,z:0})[0]-.7)<1e-12);
assert.deepEqual(FlareGlareIncident({...source,currentIntensity:0},{x:0,y:0,z:1}),[0,0,0]);
assert.deepEqual(FlareGlareIncident({...source,currentIntensity:NaN},{x:0,y:0,z:1}),[0,0,0]);
assert.ok(FlareGlareIncident(source,{x:0,y:0,z:0}).every(Number.isFinite),'Near-source safety is finite');
// Numerically integrate the angular kernel, independently of the closed-form
// normalizer, including the footprint of a coarse quarter-resolution pixel.
const Integral=pixelAngle=>{
 const end=G.supportDeg*Math.PI/180,steps=20000,h=end/steps;let sum=0;
 for(let i=0;i<steps;i++){const angle=(i+.5)*h;sum+=FlareGlareProfile(angle,pixelAngle)*2*Math.PI*Math.sin(angle)*h;}
 return sum;
};
const clear=Integral(0),coarse=Integral(.004);
assert.ok(Math.abs(clear-1)<.001&&Math.abs(coarse-1)<.001,'Pixel filtering preserves angular energy');
assert.ok(FlareGlareProfile(0,.004)<FlareGlareProfile(0,0),'Coarse pixels filter the peak instead of aliasing the source');
assert.equal(FlareGlareProfile(G.supportDeg*Math.PI/180),0);
const samples=Array.from({length:100},(_,i)=>FlareGlareProfile(i/100*.05));
assert.ok(samples.every((v,i)=>i===0||v<=samples[i-1]),'A restrained halo has no invented diffraction rings');
assert.equal(G.slots,2);assert.equal(G.byQuality.low,0);assert.equal(G.byQuality.whitebox,0);
// Exercise the actual pass gates: medium has no solar lens-flare capability,
// yet its source PSF must run. Hiding the emitter clears the optical layer while
// leaving the independent physical light object/intensity present.
const camera=new THREE.PerspectiveCamera(70,16/9,.1,600);camera.updateMatrixWorld();
const marked={...source,position:new THREE.Vector3(0,0,-100),opticalEmitter:true,temporalFlutter:false,handle:1};
const pipeline={quality:'medium',whiteboxConfig:null},pass=new LensFlarePass(pipeline,{});
pass.SetSource({fireSources:new Map([[1,marked]])});
const ctx={preset:{lensFlare:false},options:{lensFlare:0},normalDepthTexture:{},camera,view:camera.matrixWorldInverse,
 projScale:new THREE.Vector2(1/Math.tan(35*Math.PI/180)/(16/9),1/Math.tan(35*Math.PI/180)),
 width:1280,height:720,outputWidth:1280,outputHeight:720,jitterX:.25,jitterY:-.25,frame:1};
try{
 pass.Prepare(ctx);assert.ok(pass.Enabled()&&pass.emitterActive);assert.equal(pass.strength,1);
 assert.equal(pass.uniforms.uLegacyScale.value,0);assert.equal(pass.dirtStrength,0);
 marked.emitterVisible=false;pass.Prepare(ctx);assert.ok(!pass.Enabled());assert.equal(marked.currentIntensity,90000);
 assert.ok(pass.uniforms.uEmitterSource.value.every(slot=>slot.w===0));
 marked.emitterVisible=true;pipeline.quality='low';pass.Prepare(ctx);assert.ok(!pass.Enabled());
 pipeline.quality='high';pipeline.whiteboxConfig={effects:true};pass.Prepare(ctx);assert.ok(!pass.Enabled());
}finally{pass.Dispose();}
console.log('FlareGlareTest passed',JSON.stringify({near,far,integral:clear,filteredIntegral:coarse}));
