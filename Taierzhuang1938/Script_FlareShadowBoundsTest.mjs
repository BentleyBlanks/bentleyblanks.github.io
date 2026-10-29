import assert from 'node:assert/strict';
import {FitReceiverCone,ReceiverConeCovered} from './Script_FlareShadowBounds.mjs';
import {FLARE_SHADOW} from './Data_Tuning_FlareEffects.mjs';
assert.equal(FLARE_SHADOW.farSize,FLARE_SHADOW.size*2,'Adaptive far map occupies exactly four existing packed areas');
assert.ok(FLARE_SHADOW.faces>=5,'The packed source must hold far areas0–3 plus near area4');
let seed=0x19381029;const Random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const Dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const Normal=v=>{const length=Math.hypot(...v);return v.map(x=>x/length);};
const Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function Projection(fit,source,near=.25){
 const a=fit.direction,r=Normal(Cross(a,Math.abs(a[1])>.9?[0,0,1]:[0,1,0])),u=Cross(r,a);
 const f=1/Math.tan(fit.angle),depth=(fit.far+near)/(fit.far-near),offset=-2*fit.far*near/(fit.far-near);
 const matrix=[r[0]*f,u[0]*f,a[0]*depth,a[0],r[1]*f,u[1]*f,a[1]*depth,a[1],r[2]*f,u[2]*f,a[2]*depth,a[2],
  -Dot(r,[source.x,source.y,source.z])*f,-Dot(u,[source.x,source.y,source.z])*f,offset-depth*Dot(a,[source.x,source.y,source.z]),-Dot(a,[source.x,source.y,source.z])];
 if(fit.minU!=null)for(let i=0;i<4;i++){
  const at=i*4;matrix[at]=2*matrix[at]/(fit.maxU-fit.minU)-(fit.maxU+fit.minU)*matrix[at+3]/(fit.maxU-fit.minU);
  matrix[at+1]=2*matrix[at+1]/(fit.maxV-fit.minV)-(fit.maxV+fit.minV)*matrix[at+3]/(fit.maxV-fit.minV);
 }
 return matrix;
}
let accepted=0,samples=0,coveredOwnProjection=0;
const cfg={nearM:.25,normalBiasM:.045,depthGuardM:2};
for(let trial=0;trial<3000;trial++){
 const source={x:(Random()-.5)*1000,y:30+Random()*150,z:(Random()-.5)*1000},radius=600;
 const angle=Random()*Math.PI*2,forward=[Math.cos(angle),0,Math.sin(angle)],eye=[source.x-forward[0]*25,1.7,source.z-forward[2]*25];
 const nearPlane={normal:{x:forward[0],y:0,z:forward[2]},constant:-Dot(forward,eye)-.05};
 const boxes=[];
 for(let box=0;box<4;box++){
  const distance=Random()*450-70,side=(Random()-.5)*150,center=[source.x+forward[0]*distance-forward[2]*side,Random()*8,source.z+forward[2]*distance+forward[0]*side],extent=5+Random()*80;
  boxes.push({min:{x:center[0]-extent,y:center[1]-.5,z:center[2]-extent},max:{x:center[0]+extent,y:center[1]+2,z:center[2]+extent}});
 }
 const fit=FitReceiverCone(source,radius,boxes,nearPlane,cfg);if(!fit)continue;accepted++;
 assert.ok(Math.abs(Math.hypot(...fit.direction)-1)<1e-10&&fit.angle<Math.PI/2&&fit.minDepth>=cfg.nearM);
 for(const box of boxes)for(let i=0;i<30;i++){
  const p=[box.min.x-cfg.normalBiasM+Random()*(box.max.x-box.min.x+2*cfg.normalBiasM),box.min.y-cfg.normalBiasM+Random()*(box.max.y-box.min.y+2*cfg.normalBiasM),box.min.z-cfg.normalBiasM+Random()*(box.max.z-box.min.z+2*cfg.normalBiasM)];
  const relative=[p[0]-source.x,p[1]-source.y,p[2]-source.z];
  if(Dot(forward,p)+nearPlane.constant < -cfg.normalBiasM||Math.max(...relative.map(Math.abs))>radius||Math.hypot(...relative)>radius)continue;
  const depth=Dot(fit.direction,relative);samples++;
  assert.ok(depth>=cfg.nearM-1e-8&&depth<=fit.far+1e-8,'Accepted cone depth must contain every sampled lit receiver');
  assert.ok(depth/Math.hypot(...relative)>=Math.cos(fit.angle)-1e-10,'Accepted cone must contain every clipped-box interior point');
 }
 if(ReceiverConeCovered(Projection(fit,source),source,radius,boxes,nearPlane,cfg))coveredOwnProjection++;
}
assert.ok(accepted>1000&&samples>100000,'Fuzz must exercise accepted cones, not only fallback');
const source={x:0,y:0,z:0},single=[{min:{x:90,y:-2,z:-2},max:{x:110,y:2,z:2}}],fit=FitReceiverCone(source,600,single,null,cfg);
assert.ok(fit&&ReceiverConeCovered(Projection(fit,source),source,600,single,null,cfg),'Fresh cone must cover its own margin');
assert.equal(ReceiverConeCovered(Projection(fit,source),{x:0,y:200,z:0},600,[{min:{x:90,y:198,z:-2},max:{x:110,y:202,z:2}}],null,cfg),false,'Moved source/receivers must be tested in the LAST world frame');
const nearOnly=[{min:{x:-.1,y:-.1,z:-.1},max:{x:.1,y:.1,z:.1}}];assert.equal(FitReceiverCone(source,600,nearOnly,null,cfg),null);
const opposing=[{min:{x:99,y:-1,z:-1},max:{x:101,y:1,z:1}},{min:{x:-101,y:-1,z:-1},max:{x:-99,y:1,z:1}}];assert.equal(FitReceiverCone(source,600,opposing,null,cfg),null,'Opposite directions cannot fit an85degree cone');
const movingBoxes=[{min:{x:90,y:-12,z:-12},max:{x:110,y:12,z:12}}];
let movingSource={x:0,y:0,z:0},movingFit=FitReceiverCone(movingSource,600,movingBoxes,null,cfg),movingMatrix=Projection(movingFit,movingSource),movingReuses=0;
for(let frame=1;frame<=20;frame++){
 const next={x:frame*.02,y:-frame*.04,z:0},delta=[next.x-movingSource.x,next.y-movingSource.y,next.z-movingSource.z],shifted=movingMatrix.slice();
 for(let row=0;row<4;row++)shifted[12+row]-=shifted[row]*delta[0]+shifted[4+row]*delta[1]+shifted[8+row]*delta[2];
 if(ReceiverConeCovered(shifted,next,600,movingBoxes,null,cfg))movingReuses++;else movingFit=FitReceiverCone(next,600,movingBoxes,null,cfg);
 movingMatrix=Projection(movingFit,next);assert.ok(ReceiverConeCovered(movingMatrix,next,600,movingBoxes,null,cfg),'Every moved projection must retain its current receiver certificate');movingSource=next;
}
assert.ok(movingReuses>=10,'The fit reserve must support small physical motion without unnecessary refitting');
assert.equal(coveredOwnProjection,accepted,'Fresh certified projections must cover their own receiver margin');
const report={accepted,samples,coveredOwnProjection,movingReuses,seed};console.log('FlareShadowBoundsTest passed',JSON.stringify(report));
