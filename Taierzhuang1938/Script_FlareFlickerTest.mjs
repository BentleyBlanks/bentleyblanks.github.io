import assert from 'node:assert/strict';
import {FlareBurnModulation,SampleFlareAttitude,FlareAngularGain,FlarePhotometricScale} from './Script_FlareOptics.mjs';
import {FLARE_OPTICS as O,FLARE_EFFECTS,FLARE_ART as A} from './Data_Tuning_FlareEffects.mjs';
const f={...FLARE_EFFECTS.Illumination,ignitedAt:4.515,flickerPhase:1.7,swayPhase:.9};
const values=Array.from({length:1200},(_,i)=>FlareBurnModulation(f,6+i/120,1/60));
const min=Math.min(...values),max=Math.max(...values);
const mean=values.reduce((s,v)=>s+v,0)/values.length,rms=Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length);
assert.ok(min>.9&&max<1.1&&rms>.01&&rms<.04,'Fine flutter, no deep brightness dips or overdriven flash');
assert.ok(Math.abs(mean-1)<.003,'Preserve nominal mean candlepower instead of permanently dimming the flare');
let total=0,slow=0,fast=0;
for(let k=1;k<=values.length/2;k++){
 let re=0,im=0;for(let i=0;i<values.length;i++){const v=(values[i]-mean)*(.5-.5*Math.cos(2*Math.PI*i/(values.length-1))),a=2*Math.PI*k*i/values.length;re+=v*Math.cos(a);im+=v*Math.sin(a);}
 const energy=re*re+im*im,hz=k*120/values.length;total+=energy;if(hz<3)slow+=energy;if(hz>=5&&hz<=25)fast+=energy;
}
assert.ok(slow/total<.03&&fast/total>.9,'Optical output must be dominated by fast fine flutter, not merely a fast noise update clock');
const averaged=Array.from({length:1200},(_,i)=>FlareBurnModulation(f,6+i/120,1/15));
assert.ok(Math.max(...averaged)-Math.min(...averaged)<max-min,'Long frames integrate fast emission instead of aliasing it into a false slow strobe');
assert.equal(FlarePhotometricScale(0xffffff),1);
assert.equal(FlarePhotometricScale(0),0,'Black cannot acquire spurious intensity during color normalization');
assert.ok(FlarePhotometricScale(0xff2110)>4,'Red tint must retain its specified photopic candlepower');
const radius=FLARE_EFFECTS.SignalRed.lightRadiusM;
assert.ok((1-(100/radius)**4)**2>.95,'Signal light culling must not suppress illumination at its normal flight height');
const replay=[7.123,21.4,8.7,7.123].map(t=>FlareBurnModulation(f,t));assert.equal(replay[0],replay[3]);
assert.notEqual(replay[0],FlareBurnModulation({...f,flickerPhase:2.7},7.123),'Different launches do not flicker in unison');
assert.equal(FlareBurnModulation(f,f.ignitedAt+f.igniteS),1,'Ignition joins combustion without a one-frame light step');
for(const t of [4.515,4.6,5,7,12,23]){
 const p=SampleFlareAttitude(f,t),d=p.direction,L=A.cordLength+A.leaderLength;
 assert.ok(Math.abs(Math.hypot(d.x,d.y,d.z)-1)<1e-9);
 // The luminous candle swings below a stable canopy suspension point.
 assert.ok(Math.abs(p.offset.x-d.x*L)<1e-9&&Math.abs(p.offset.z-d.z*L)<1e-9);
 assert.ok(d.y<-.8,'No inverted candle or searchlight sweep');
}
assert.equal(FlareAngularGain(1),1);assert.equal(FlareAngularGain(-1),O.angularFloor);
assert.ok(FlareAngularGain(.3)<FlareAngularGain(.8),'Broad emission lobe, no hard cone edge');
assert.deepEqual(SampleFlareAttitude({...f,opticalMotion:false},8).direction,{x:0,y:-1,z:-0});
assert.deepEqual(SampleFlareAttitude({...f,parachute:false},8).offset,{x:0,y:0,z:-0},'Discarded carrier never inherits parachute motion');
console.log('FlareFlickerTest passed',JSON.stringify({min,max,mean,rms,slowFraction:slow/total,fastFraction:fast/total}));
