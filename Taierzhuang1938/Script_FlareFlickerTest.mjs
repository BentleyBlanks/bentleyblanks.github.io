import assert from 'node:assert/strict';
import {FlareBurnModulation,SampleFlareAttitude,FlareAngularGain} from './Script_FlareOptics.mjs';
import {FLARE_OPTICS as O,FLARE_EFFECTS,FLARE_ART as A} from './Data_Tuning_FlareEffects.mjs';
const f={...FLARE_EFFECTS.Illumination,ignitedAt:4.515,flickerPhase:1.7,swayPhase:.9};
const values=Array.from({length:2400},(_,i)=>FlareBurnModulation(f,5+i/120));
const min=Math.min(...values),max=Math.max(...values);
assert.ok(min>=O.floor&&max<=1&&max-min>.3,'Clearly variable, continuous combustion with no on/off strobe');
assert.ok(values.every((v,i)=>!i||Math.abs(v-values[i-1])<.05),'No discontinuous per-frame white flashes');
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
console.log('FlareFlickerTest passed',JSON.stringify({min,max,span:max-min}));
