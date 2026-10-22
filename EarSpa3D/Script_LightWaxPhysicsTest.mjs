import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {CreatePeelBody,PosePeelBody} from './Script_PeelPhysics.mjs';
import * as current from './Script_SoftWaxPhysics.mjs';
import {CreateWaxFlight,StepWaxFlight,WaxGravityMm} from './Script_WaxFlight.mjs';
const ModuleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const utility=ModuleUrl(await fs.readFile(new URL('./Script_Util.js',import.meta.url),'utf8'));
const source=(await fs.readFile(new URL('./Script_WaxMorphology.mjs',import.meta.url),'utf8')).replace("'./Script_Util.js'",JSON.stringify(utility))
  .replace(/'\.\/Data_WaxSculptProfiles\.mjs\?[^']*'/,JSON.stringify(new URL('./Data_WaxSculptProfiles.mjs',import.meta.url).href));
const {BuildWaxShape}=await import(ModuleUrl(source));
const report={checks:[],flight:[],comparison:null},Check=(condition,label)=>{assert.ok(condition,label);report.checks.push(label);};
function Body(api,type){
  const shape=BuildWaxShape({seed:17,type,radii:[.9,1.2]});
  const body=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:.8,type,footprint:[.9,1.2],anchorCount:9});
  api.BindWaxSurface(body,shape.positions,shape.indices);return {body,shape};
}
Check(WaxGravityMm===9810,'gravity converts metres to the scene millimetre scale');
const vacuumShape={positions:new Float32Array([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0])};
for(const type of ['dry','wet','impacted']){
  const position=[3,100,7],flight=CreateWaxFlight({positions:vacuumShape.positions,rotation:[0,0,0,1],velocity:[2,0,-3],type});
  flight.drag=0;
  for(let i=0;i<6;i++)StepWaxFlight(flight,position,1/60,{rotate:false});
  Check(Math.abs(position[1]-(100-WaxGravityMm*.1*.1*.5))<1e-10&&Math.abs(flight.velocity[1]+WaxGravityMm*.1)<1e-10,type+' free fall follows y = y0 - 0.5 g t² and v = -g t');
  Check(Math.abs(position[0]-3.2)<1e-10&&Math.abs(position[2]-6.7)<1e-10,type+' gravity does not inject sideways motion');
}
const resisted=[];
for(const [type,thickness] of [['dry',.035],['wet',.15],['impacted',.34]]){
  const shape=BuildWaxShape({seed:19,type,radii:[.9,1.2]});
  const results=[30,60,120].map(fps=>{
    const position=[0,2.3,0],flight=CreateWaxFlight({positions:shape.positions,rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2],type,thickness});
    let landedAt=0;for(let i=0;i<fps*2;i++){StepWaxFlight(flight,position,1/fps);if(!landedAt&&position[1]<=0)landedAt=(i+1)/fps;}
    return {position,flight,landedAt};
  });
  Check(results.every(r=>r.position.every(Number.isFinite)&&Math.abs(Math.hypot(...r.flight.rotation)-1)<1e-10),type+' flight remains finite and normalized');
  Check(results.every(r=>r.position.every((v,i)=>Math.abs(v-results[0].position[i])<1e-9)),type+' flight matches at 30/60/120 Hz with 240 Hz substeps');
  Check(results.every(r=>r.landedAt>0&&r.landedAt<=1/30),type+' falls 2.3 mm to the tray within a natural-gravity frame');
  report.flight.push({type,landedAt:results[1].landedAt,drift:Math.hypot(results[1].position[0],results[1].position[2]),speed:Math.hypot(...results[1].flight.velocity)});
  const position=[0,100,0],flight=CreateWaxFlight({positions:shape.positions,rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2],type,thickness});
  for(let i=0;i<6;i++)StepWaxFlight(flight,position,1/60,{rotate:false});
  const expected=100-WaxGravityMm/flight.drag*(.1+(Math.expm1(-flight.drag*.1)/flight.drag));
  Check(Math.abs(position[1]-expected)<1e-10,type+' downward acceleration and broadside air drag match the analytic solution');
  Check(position[1]<100&&position[1]>100-WaxGravityMm*.1*.1*.5,type+' air resistance slows descent without changing gravity direction');
  resisted.push(position[1]);
}
Check(resisted[0]>resisted[1]&&resisted[1]>resisted[2],'air drag makes thin dry flakes fall more slowly than wet wax and dense plugs');
const driftingPosition=[0,0,0],driftingFlight=CreateWaxFlight({positions:vacuumShape.positions,rotation:[.5,.5,.5,.5],velocity:[12,-7,9],spin:[1,2,3]}),initialSpeed=Math.hypot(...driftingFlight.velocity);let previousSpeed=initialSpeed,dissipative=true;
for(let i=0;i<60;i++){StepWaxFlight(driftingFlight,driftingPosition,1/60,{gravity:0});const speed=Math.hypot(...driftingFlight.velocity);dissipative&&=speed<=previousSpeed+1e-10;previousSpeed=speed;}
Check(dissipative&&previousSpeed<=initialSpeed*Math.exp(-driftingFlight.drag*.13)+1e-9,'orientation-dependent air resistance dissipates motion instead of producing free energy');
const floorPosition=[0,2.3,0],floorFlight=CreateWaxFlight({positions:vacuumShape.positions,rotation:[0,0,0,1]});let collisionSteps=0,firstFloorStep=0;
for(let i=0;i<30;i++)StepWaxFlight(floorFlight,floorPosition,1/30,{rotate:false,onSubstep:(flight,position)=>{
  collisionSteps++;if(position[1]<=0){if(!firstFloorStep)firstFloorStep=collisionSteps;position[1]=0;flight.velocity[1]=Math.max(0,flight.velocity[1]);}
}});
Check(collisionSteps===240&&firstFloorStep>0&&firstFloorStep<=6,'scene collision callback observes every 240 Hz falling substep');
Check(floorPosition[1]===0&&floorFlight.velocity[1]===0,'substep contact stops a falling piece at the floor without penetration or anti-gravity bounce');
const zeroPosition=floorPosition.slice(),steps=floorFlight.steps;StepWaxFlight(floorFlight,floorPosition,0);
Check(floorFlight.steps===steps&&floorPosition.every((v,i)=>v===zeroPosition[i]),'zero elapsed time cannot move wax or advance the physics clock');
const {body:posed,shape}=Body(current,'dry'),before=new Float32Array(shape.positions.length),after=new Float32Array(shape.positions.length);
current.WriteWaxSurface(posed,before);PosePeelBody(posed,[4,-7,2],[0,Math.SQRT1_2,0,Math.SQRT1_2]);current.WriteWaxSurface(posed,after);
Check(before.every((v,i)=>Math.abs(v-after[i])<1e-6),'carry pose transports all shell nodes without altering its local shape');
// Optional comparison loads the real previous revision, never a copied formula.
const revision=process.argv.find(a=>a.startsWith('--compare='))?.slice(10);
if(revision){
  const oldSource=execFileSync('git',['show',revision+':EarSpa3D/Script_SoftWaxPhysics.mjs'],{encoding:'utf8'}).replace(/'\.\/Data_WaxPhysicsSettings\.mjs[^']*'/,JSON.stringify(new URL('./Data_WaxPhysicsSettings.mjs',import.meta.url).href));
  const previous=await import(ModuleUrl(oldSource));let maxError=0;const times={before:[],after:[]};
  function Simulate(api,type,timing){
    const {body,shape}=Body(api,type),output=new Float32Array(shape.positions.length),response=new Float32Array(shape.positions.length);
    api.GripWaxSurface(body,body.surface.points[53].slice());const point=body.surface.points[53].slice();
    const start=performance.now();
    for(let frame=0;frame<90;frame++){
      api.StepWaxSurface(body,{target:[point[0]+Math.sin(frame*.05)*.05,point[1],point[2]+Math.min(frame/70,.7)],minAnchors:9},1/60);
      api.WriteWaxSurface(body,output,response);
    }
    timing.push((performance.now()-start)/90);return{body,output,response};
  }
  for(let round=0;round<4;round++)for(const type of ['dry','wet','impacted']){
    let a,b;
    if(round%2){b=Simulate(current,type,times.after);a=Simulate(previous,type,times.before);}else{a=Simulate(previous,type,times.before);b=Simulate(current,type,times.after);}
    for(let i=0;i<a.output.length;i++)maxError=Math.max(maxError,Math.abs(a.output[i]-b.output[i]),Math.abs(a.response[i]-b.response[i]));
    Check(a.body.anchors.every((v,i)=>v.alive===b.body.anchors[i].alive),'optimized '+type+' keeps the same local wall bonds (round '+round+')');
  }
  Check(maxError<1e-6,'optimized constraints and skinning match the previous solver within 1e-6 mm');
  const Median=values=>values.slice(3).sort((a,b)=>a-b)[4];
  report.comparison={revision,maxError,beforeMs:Median(times.before),afterMs:Median(times.after)};
  report.comparison.speedup=report.comparison.beforeMs/report.comparison.afterMs;
}
await fs.mkdir(new URL('./_dev/',import.meta.url),{recursive:true});await fs.writeFile(new URL('./_dev/Data_LightWaxPhysicsReport.json',import.meta.url),JSON.stringify(report,null,2));
console.log('PASS '+report.checks.length+' light wax physics checks '+JSON.stringify({flight:report.flight,comparison:report.comparison}));
