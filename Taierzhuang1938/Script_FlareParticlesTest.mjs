import assert from 'node:assert/strict';
import {FlareDirector,SampleFlarePosition} from './Script_Flare.mjs';
import {FlareCoreRadiance,FlarePhotometricScale,SampleFlareCombustion,FlareLaunchEmission} from './Script_FlareOptics.mjs';
import {SampleFlareRelease,SampleFlareSpark,SampleFlareSmoke,SampleFlareFlowDirection} from './Script_FlareParticles.mjs';
import {FLARE_ART as A,FLARE_PHOTOMETRY as P,FLARE_COMBUSTION as C} from './Data_Tuning_FlareEffects.mjs';
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
const SmokeAt=(flare,t)=>Array.from({length:A.smokeCount},(_,i)=>SampleFlareSmoke(flare,t,i)).filter(Boolean);
const smokeReplay=SmokeAt(f,1.233);SmokeAt(f,7);SmokeAt(f,.4);
assert.deepEqual(SmokeAt(f,1.233),smokeReplay,'Smoke seek is independent of playback history');
const newbornSmoke=SampleFlareSmoke(f,1.5,0),newbornPosition=SampleFlarePosition(f,1.5);
assert.ok(newbornSmoke&&newbornSmoke.age===0&&!newbornSmoke.launch);
assert.ok(Math.hypot(newbornSmoke.x-newbornPosition.x,newbornSmoke.z-newbornPosition.z)<=Math.SQRT2*.025&&newbornSmoke.y===newbornPosition.y,'Combustion smoke is born at the actual moving source with only its authored small meander');
assert.equal(SampleFlareSmoke(f,1,-1),null,'No future smoke is emitted before its birth');
assert.equal(SmokeAt(f,f.outAt+A.smokeLife+.1).length,0);
// Source motion before apogee does not depend on wind. Hold the same particle
// birth and meander fixed while changing the wind; compare its extra travel to
// an independent midpoint integration of dv/dt=(wind-v)/tau, dx/dt=v, v(0)=0.
const calm={...f,driftMS:0};
function IntegrateWindDisplacement(wind,age){
 const steps=Math.max(1,Math.ceil(age/.00005)),dt=age/steps;let x=0,v=0;
 for(let i=0;i<steps;i++){
  const midpointV=v+(wind-v)*dt/(2*A.smokeDragS);
  x+=midpointV*dt;v+=(wind-midpointV)*dt/A.smokeDragS;
 }
 return x;
}
const windCases=[];
for(const wind of [{speed:3,direction:0},{speed:3,direction:Math.PI/2},{speed:2.2,direction:-.7}]){
 const windy={...f,driftMS:wind.speed,driftDirRad:wind.direction};
 for(const age of [.00001,.02,.12,.9,2.3]){
  const t=1+age,index=Math.floor(t*A.smokeHz)-A.smokeHz;
  const a=SampleFlareSmoke(calm,t,index),b=SampleFlareSmoke(windy,t,index);
  assert.ok(a&&b&&a.born===1&&b.born===1&&a.size===b.size&&a.seed===b.seed);
  const expectedX=IntegrateWindDisplacement(wind.speed*Math.sin(wind.direction),age);
  const expectedZ=IntegrateWindDisplacement(wind.speed*Math.cos(wind.direction),age);
  assert.ok(Math.abs((b.x-a.x)-expectedX)<1e-6&&Math.abs((b.z-a.z)-expectedZ)<1e-6,'Smoke wind response follows drag acceleration without counting wind twice');
  assert.equal(a.y,b.y,'Horizontal wind cannot alter inherited vertical momentum or buoyancy');
  if(age<.0001)assert.ok(Math.hypot(b.x-a.x,b.z-a.z)/age<.001,'Wind cannot instantly jump the velocity of a just-released smoke particle');
  windCases.push({speed:wind.speed,direction:wind.direction,age,displacement:[b.x-a.x,b.z-a.z]});
 }
}
for(const time of [.2,2,f.ascendS-.03,f.ascendS+.03,7]){
 const released=SampleFlareRelease(f,time),flow=SampleFlareFlowDirection(f,time);
 const relative={x:released.velocity.x-Math.sin(f.driftDirRad)*f.driftMS,y:released.velocity.y,z:released.velocity.z-Math.cos(f.driftDirRad)*f.driftMS};
 assert.ok(Math.abs(Math.hypot(flow.x,flow.y,flow.z)-1)<1e-12,'Air-relative emission axis remains a unit direction through apogee');
 assert.ok(flow.x*relative.x+flow.y*relative.y+flow.z*relative.z<0,'Free-star flame and ejecta trail air-relative carrier motion');
}
// A uniform horizontal boost of both the carrier and its surrounding air must
// translate particles by boost*t without changing the flame/ejection direction.
// This checks the combined release, airflow and drag behavior independently of
// their formulae, including the star's apogee transition.
const boost=3,boosted={...calm,at:{...calm.at,x:calm.at.x+boost*calm.ascendS},driftMS:boost,driftDirRad:Math.PI/2};
for(const time of [1.2,3.3,5.2,7]){
 const index=Math.floor(time*A.smokeHz)-A.smokeHz;
 const smoke=SampleFlareSmoke(calm,time,index),movingSmoke=SampleFlareSmoke(boosted,time,index);
 assert.ok(smoke&&movingSmoke&&Math.abs(movingSmoke.x-smoke.x-boost*time)<1e-10&&Math.abs(movingSmoke.z-smoke.z)<1e-10,'Smoke motion is invariant to a shared horizontal carrier/air velocity');
 const flow=SampleFlareFlowDirection(calm,time),movingFlow=SampleFlareFlowDirection(boosted,time);
 assert.ok(Math.hypot(flow.x-movingFlow.x,flow.y-movingFlow.y,flow.z-movingFlow.z)<1e-10,'A shared air/carrier boost cannot rotate the flame');
 for(let i=0;i<A.sparkCount;i++){
  const spark=SampleFlareSpark(calm,time,i),movingSpark=SampleFlareSpark(boosted,time,i);
  assert.equal(!!spark,!!movingSpark);
  if(spark)assert.ok(Math.abs(movingSpark.x-spark.x-boost*time)<1e-10&&Math.abs(movingSpark.y-spark.y)<1e-10&&Math.abs(movingSpark.z-spark.z)<1e-10,'Air-relative ejecta preserve the same trajectory under a shared velocity boost');
 }
}
const carriedFlow=SampleFlareFlowDirection({...f,driftMS:2,driftDirRad:Math.PI/2},1,{velocity:{x:2,y:0,z:0}});
assert.deepEqual(carriedFlow,{x:0,y:1,z:0},'A source moving with the air has no horizontal apparent wind; retain an upward buoyant flame');
const downwardFlow=SampleFlareFlowDirection({...f,parachute:true,opticalMotion:false},5);
assert.ok(Math.abs(downwardFlow.x)+Math.abs(downwardFlow.z)<1e-12&&downwardFlow.y===-1,'Housing-directed parachute emission retains its downward axis');
// A real pre-deployment ceiling collision leaves a cold spent carrier. Advance
// past its original ignition timestamp and compare with an unobstructed launch.
const Ceiling=(from,to)=>{
 if(from.y>=3||to.y<3)return null;
 const fraction=(3-from.y)/(to.y-from.y);
 return {fraction,point:{x:from.x+(to.x-from.x)*fraction,y:3,z:from.z+(to.z-from.z)*fraction},normal:[0,-1,0],surface:'solid'};
};
const blockedDirector=new FlareDirector({GroundHeight:()=>0,TraceSegment:Ceiling},{seed:1938});
const clearDirector=new FlareDirector({GroundHeight:()=>0},{seed:1938});
for(const director of [blockedDirector,clearDirector]){
 director.LaunchFlare({preset:'Illumination',from:{x:0,z:0}});
 for(let i=0;i<50;i++)director.Update(.1);
}
const blocked=blockedDirector.flares[0],clear=clearDirector.flares[0];
assert.ok(blocked.launchObstructed&&blocked.phase==='spent'&&blocked.intensity===0,'Ceiling collision never reaches ignition');
assert.ok(!clear.launchObstructed&&clear.phase==='burn'&&clear.intensity>0);
for(const time of [4.6,5,5.6])assert.ok(Array.from({length:A.sparkCount},(_,i)=>SampleFlareSpark(blocked,time,i)).every(p=>p===null),'Unignited spent carrier cannot emit sparks after its scheduled ignition time');
assert.ok(Array.from({length:A.sparkCount},(_,i)=>SampleFlareSpark(clear,5,i)).filter(Boolean).length>3,'Unobstructed burning flare keeps its hot particles');
assert.ok(SmokeAt(blocked,5).length===4&&SmokeAt(blocked,5).every(p=>p.launch&&p.born<.16),'Blocked white carrier leaves only the four actual launch-smoke births');
assert.ok(SmokeAt(clear,5).some(p=>!p.launch&&p.born>=clear.ignitedAt),'Deployed white flame emits new combustion smoke');
// Check both ammunition types across all visual stages rather than one steady
// burn frame. Shape follows fuel; nominal candela remains the light contract.
for(const flare of [f,clear]){
 const before=SampleFlareCombustion(flare,flare.ignitedAt-.001);
 assert.ok(!before.active&&before.fuel===0&&before.width===0&&before.length===0&&before.ember===0);
 const rising=[0,.2,.5,.8,1].map(u=>SampleFlareCombustion(flare,flare.ignitedAt+u*flare.igniteS));
 assert.ok(rising.every((s,i)=>s.active&&(i===0||s.width>rising[i-1].width&&s.length>rising[i-1].length)),'Ignition grows the visible core in both dimensions');
 const shrinking=[0,.2,.5,.8,.999].map(u=>SampleFlareCombustion(flare,flare.fadeAt+u*flare.fadeS));
 assert.ok(shrinking.every((s,i)=>s.active&&(i===0||s.width<shrinking[i-1].width&&s.length<shrinking[i-1].length)),'Burnout shrinks visible material, not only its light intensity');
 const cooling=[0,.25,.5,.75,1].map(u=>SampleFlareCombustion(flare,flare.outAt+u*C.emberLifeS));
 assert.ok(cooling.every(s=>!s.active&&s.fuel===0&&s.width===0&&s.length===0));
 assert.ok(cooling.every(s=>Number.isFinite(s.ember)&&s.ember>=0&&Number.isFinite(s.emberScale)&&s.emberScale>=0),'Cooling cannot produce negative radiance or NaN sizes near its endpoint');
 assert.ok(cooling[0].ember>0&&cooling.every((s,i)=>i===0||s.ember<cooling[i-1].ember),'The residual cools monotonically to zero');
 assert.equal(cooling.at(-1).ember,0);assert.equal(cooling.at(-1).emberScale,0);
 assert.equal(SampleFlareCombustion(flare,flare.outAt+C.emberLifeS+1).ember,0);
 const boundaryBefore=SampleFlareCombustion(flare,flare.outAt-1e-7),boundaryAfter=SampleFlareCombustion(flare,flare.outAt+1e-7);
 assert.ok(boundaryBefore.ember>0&&Math.abs(boundaryBefore.ember-boundaryAfter.ember)<1e-4&&Math.abs(boundaryBefore.emberScale-boundaryAfter.emberScale)<1e-4,'The warm remnant is already visible before extinction and does not newly ignite at outAt');
 const time=flare.fadeAt+flare.fadeS*.43,originalTime=flare.t,first=SampleFlareCombustion(flare,time);
 SampleFlareCombustion(flare,flare.outAt+.1);SampleFlareCombustion(flare,flare.ignitedAt-.1);
 assert.deepEqual(SampleFlareCombustion({...flare,phase:'spent'},time),first,'Absolute-time shape does not depend on seek direction or a stale phase label');
 assert.equal(flare.t,originalTime,'Sampling a preview time cannot mutate the director clock');
}
for(const time of [blocked.ignitedAt+.1,blocked.fadeAt+.1,blocked.outAt,blocked.outAt+C.emberLifeS*.5]){
 const shape=SampleFlareCombustion(blocked,time);
 assert.ok(!shape.active&&shape.fuel===0&&shape.width===0&&shape.length===0&&shape.ember===0&&shape.emberScale===0,'An unignited obstructed carrier has neither combustion nor a later hot residual');
}
// Afterglow is visible material only: it must not restart the director's lamp.
let residualLamp,residualLampRemoved=false;
const residualDirector=new FlareDirector({GroundHeight:()=>0,AddLight:()=>1,MoveLight:(id,spec)=>residualLamp=spec,
 RemoveLight:id=>{assert.equal(id,1);residualLamp=null;residualLampRemoved=true;}},{seed:1938});
residualDirector.LaunchFlare({preset:'Illumination',from:{x:0,z:0}});
const residualFlare=residualDirector.flares[0];
while(residualFlare.t<residualFlare.outAt+.02)residualDirector.Update(.05);
assert.ok(SampleFlareCombustion(residualFlare).ember>0&&residualFlare.intensity===0&&residualFlare.lightHandle===null&&residualLampRemoved&&residualLamp===null,'A cooling visible remnant leaves the actual illumination lamp removed');
while(residualFlare.t<residualFlare.outAt+C.emberLifeS+.02)residualDirector.Update(.05);
assert.equal(SampleFlareCombustion(residualFlare).ember,0);assert.equal(residualLamp,null);assert.equal(residualFlare.lightHandle,null);
// L*A = I before optical filtering and display safety clipping. The same law
// serves both colors; there is no red-only gain masquerading as candela.
const area=Math.PI*P.coreRadiusSquared*A.glowSize*A.glowSize*.25;
for(const color of [0xffffff,0xff2110]){
 const photometricScale=FlarePhotometricScale(color);
 const r=FlareCoreRadiance({intensity:600,photometricScale,sceneScale:P.dayScale});
 assert.ok(Math.abs(r*area/photometricScale-600*P.dayScale)<1e-12);
 for(const areaScale of [.01,.12,.35,1]){
  const shaped=FlareCoreRadiance({intensity:600,photometricScale,sceneScale:P.dayScale},areaScale);
  assert.ok(Number.isFinite(shaped)&&Math.abs(shaped*area*areaScale/photometricScale-600*P.dayScale)<1e-12,'Changing projected combustion area conserves the unclipped source intensity');
 }
}
const original=f.intensity;sceneScale=P.dayScale;d.StepLight(f);
assert.equal(f.intensity,original,'Scene conversion never rewrites historical/nominal candlepower');
assert.equal(light.sceneScale,P.dayScale);assert.equal(f.sceneScale,P.dayScale);
assert.equal(FlareCoreRadiance({intensity:0}),0);
// The short launch pulse is integrated over each displayed frame. Low frame
// rates retain its energy, and it never becomes extra candlepower in the star.
const launchIntegrals=[];
for(const fps of [15,30,60]){
 const dt=1/fps,values=Array.from({length:Math.ceil((C.launchS+dt)*fps)},(_,i)=>FlareLaunchEmission(clear,(i+1)*dt,dt));
 const integral=values.reduce((sum,value)=>sum+value*dt,0);launchIntegrals.push({fps,integral,peak:Math.max(...values)});
 assert.ok(values.every(value=>Number.isFinite(value)&&value>=0&&value<=1));
 assert.ok(Math.abs(integral-C.launchS/3)<1e-12,'Frame exposure preserves the complete launch pulse integral at '+fps+' fps');
 assert.equal(FlareLaunchEmission(clear,-.001,dt),0);assert.equal(FlareLaunchEmission(clear,C.launchS+dt,dt),0);
 assert.equal(FlareLaunchEmission(clear,.2,dt),0,'A brief flash cannot remain lit at 0.2 seconds');
 assert.ok(FlareLaunchEmission({...clear,launchObstructed:true},.03,dt)>0,'A later obstructed deployment does not erase the actual initial launch flash');
 for(const preset of ['SignalRed','Illumination']){
  let lamp,lightAdds=0;
  const director=new FlareDirector({GroundHeight:()=>0,AddLight:()=>++lightAdds,MoveLight:(id,spec)=>lamp=spec},{seed:1938});
  director.LaunchFlare({preset,from:{x:3,z:7},at:{x:3,z:7}});
  const flare=director.flares[0],nominalCd=flare.candleCd;
  director.Update(dt);
  assert.ok(lamp.intensity>0&&flare.intensity===0&&flare.candleCd===nominalCd,'Launch light is separate from the still unignited star');
  assert.equal(lamp.position.y,A.launchHeight);assert.equal(lamp.position.x,3);assert.equal(lamp.position.z,7);
  while(flare.t<flare.burnAt+.2)director.Update(dt);
  assert.equal(lightAdds,1,'Launch and burning star reuse one actual light slot');
  assert.equal(lamp.intensity,flare.intensity,'Only the actual burning star supplies intensity after the launch pulse');
  assert.equal(flare.candleCd,nominalCd);assert.ok(flare.intensity<=flare.maxIntensity&&flare.intensity>nominalCd*.9);
 }
}
assert.ok(launchIntegrals[0].peak<launchIntegrals[2].peak,'A longer frame averages the short pulse instead of amplifying it');
assert.equal(FlareLaunchEmission({...clear,physical:false},.03,1/60),0,'Legacy authored effects do not acquire a new physical launch pulse');
d.Reset();d.LaunchFlare({preset:'crossLane',from:{x:0,z:0},at:{x:12,z:0}});d.Update(7);
assert.equal(d.flares[0].sceneScale,1,'Legacy authored lights retain their existing scene-unit contract');
console.log('FlareParticlesTest passed: replay, ignition/burnout shape, continuous residual cooling, blocked launch, air-relative ejecta, integrated smoke drag and common source area',JSON.stringify({launchIntegrals,windCases}));
