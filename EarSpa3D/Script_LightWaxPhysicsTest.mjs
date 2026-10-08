import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {CreatePeelBody,PosePeelBody} from './Script_PeelPhysics.mjs';
import * as current from './Script_SoftWaxPhysics.mjs';
import {CreateWaxFlight,StepWaxFlight} from './Script_WaxFlight.mjs';
const ModuleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const utility=ModuleUrl(await fs.readFile(new URL('./Script_Util.js',import.meta.url),'utf8'));
const source=(await fs.readFile(new URL('./Script_WaxMorphology.mjs',import.meta.url),'utf8')).replace("'./Script_Util.js'",JSON.stringify(utility));
const {BuildWaxShape}=await import(ModuleUrl(source));
const report={checks:[],flight:[],comparison:null},Check=(condition,label)=>{assert.ok(condition,label);report.checks.push(label);};
function Body(api,type){
  const shape=BuildWaxShape({seed:17,type,radii:[.9,1.2]});
  const body=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:.8,type,footprint:[.9,1.2],anchorCount:9});
  api.BindWaxSurface(body,shape.positions,shape.indices);return {body,shape};
}
for(const [type,thickness] of [['dry',.035],['wet',.15],['impacted',.34]]){
  const shape=BuildWaxShape({seed:19,type,radii:[.9,1.2]});
  const results=[30,60,120].map(fps=>{
    const position=[0,2.3,0],flight=CreateWaxFlight({positions:shape.positions,rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2],type,thickness});
    let landedAt=0;for(let i=0;i<fps*2;i++){StepWaxFlight(flight,position,1/fps);if(!landedAt&&position[1]<=0)landedAt=(i+1)/fps;}
    return {position,flight,landedAt};
  });
  Check(results.every(r=>r.position.every(Number.isFinite)&&Math.abs(Math.hypot(...r.flight.rotation)-1)<1e-10),type+' flight remains finite and normalized');
  Check(results.every(r=>r.position.every((v,i)=>Math.abs(v-results[0].position[i])<1e-9)),type+' flight matches at 30/60/120 Hz with 240 Hz substeps');
  Check(results.every(r=>r.landedAt>0&&r.landedAt<1.9),type+' really reaches the tray before the normal delivery completes');
  report.flight.push({type,landedAt:results[1].landedAt,drift:Math.hypot(results[1].position[0],results[1].position[2]),speed:Math.hypot(...results[1].flight.velocity)});
}
Check(report.flight[0].landedAt>report.flight[1].landedAt*1.3&&report.flight[1].landedAt>report.flight[2].landedAt,'thin dry flakes fall more slowly than wet wax and dense plugs');
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
