import assert from 'node:assert/strict';
import {FlareDirector,SampleFlarePosition} from './Script_Flare.mjs';
import {FlareCoreRadiance,FlarePhotometricScale} from './Script_FlareOptics.mjs';
import {SampleFlareRelease,SampleFlareSpark} from './Script_FlareParticles.mjs';
import {FLARE_ART as A,FLARE_PHOTOMETRY as P} from './Data_Tuning_FlareEffects.mjs';
let sceneScale=1,light;
const d=new FlareDirector({GroundHeight:()=>0,AddLight:()=>1,MoveLight:(id,spec)=>light=spec,FlareSceneScale:()=>sceneScale},{seed:1938});
d.LaunchFlare({preset:'SignalRed',from:{x:0,z:0},at:{x:12,z:0}});
const f=d.flares[0];d.Update(1);
const release=SampleFlareRelease(f,1);assert.ok(release.velocity.y>20,'Rising ejecta inherit rising carrier velocity');
const Sparks=t=>Array.from({length:A.sparkCount},(_,i)=>SampleFlareSpark(f,t,i)).filter(Boolean);
const sparks=Sparks(1);assert.ok(sparks.length>3&&sparks.length<A.sparkCount);
assert.ok(sparks.every(p=>p.size>=A.sparkSizeMin&&p.size<=A.sparkSizeMax&&p.age>=0&&p.age<p.life));
assert.ok(new Set(sparks.map(p=>p.life.toFixed(4))).size>3&&new Set(sparks.map(p=>p.size.toFixed(5))).size>3,'No fixed-size, fixed-lifetime particle lattice');
assert.ok(sparks.filter(p=>p.age<.1).every(p=>p.y>SampleFlarePosition(f,p.born).y),'Fresh particles must initially rise, not instantly fall away from a rising signal');
assert.equal(Sparks(f.ignitedAt-.001).length,0);assert.equal(Sparks(f.outAt+A.sparkLife).length,0);
const replay=Sparks(1.233);Sparks(7);Sparks(.4);assert.deepEqual(Sparks(1.233),replay,'Seek is independent of playback history');
assert.notDeepEqual(SampleFlareSpark({...f,flickerPhase:f.flickerPhase+1},1,1),SampleFlareSpark(f,1,1));
// L*A = I before optical filtering and display safety clipping. The same law
// serves both colors; there is no red-only gain masquerading as candela.
const area=Math.PI*P.coreRadiusSquared*A.glowSize*A.glowSize*.25;
for(const color of [0xffffff,0xff2110]){
 const photometricScale=FlarePhotometricScale(color);
 const r=FlareCoreRadiance({intensity:600,photometricScale,sceneScale:P.dayScale});
 assert.ok(Math.abs(r*area/photometricScale-600*P.dayScale)<1e-12);
}
const original=f.intensity;sceneScale=P.dayScale;d.StepLight(f);
assert.equal(f.intensity,original,'Scene conversion never rewrites historical/nominal candlepower');
assert.equal(light.sceneScale,P.dayScale);assert.equal(f.sceneScale,P.dayScale);
assert.equal(FlareCoreRadiance({intensity:0}),0);
d.Reset();d.LaunchFlare({preset:'crossLane',from:{x:0,z:0},at:{x:12,z:0}});d.Update(7);
assert.equal(d.flares[0].sceneScale,1,'Legacy authored lights retain their existing scene-unit contract');
console.log('FlareParticlesTest passed: replay, hot-particle inertia/cooling, common source area and scene scale');
