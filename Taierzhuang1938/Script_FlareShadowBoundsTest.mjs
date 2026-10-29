import assert from 'node:assert/strict';
import {FitReceiverCone,FitReceiverProjection,ReceiverConeCovered} from './Script_FlareShadowBounds.mjs';
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

// An independent halfspace oracle enumerates ALL triples of active planes.
// Unlike the production face clipper this has no edge/cap construction, and
// catches vertices created solely by the camera frustum inside a large box.
function ClippedVertices(box,source,radius,planes,bias){
 const lo=[box.min.x-source.x-bias,box.min.y-source.y-bias,box.min.z-source.z-bias].map(x=>Math.max(x,-radius));
 const hi=[box.max.x-source.x+bias,box.max.y-source.y+bias,box.max.z-source.z+bias].map(x=>Math.min(x,radius));
 if(lo.some((x,i)=>x>hi[i]))return [];
 const halfspaces=[[1,0,0,-lo[0]],[-1,0,0,hi[0]],[0,1,0,-lo[1]],[0,-1,0,hi[1]],[0,0,1,-lo[2]],[0,0,-1,hi[2]],
  ...planes.map(p=>[...p.slice(0,3),p[3]+p[0]*source.x+p[1]*source.y+p[2]*source.z+bias*Math.hypot(...p.slice(0,3))])];
 const vertices=[];
 for(let a=0;a<halfspaces.length;a++)for(let b=a+1;b<halfspaces.length;b++)for(let c=b+1;c<halfspaces.length;c++){
  const pa=halfspaces[a],pb=halfspaces[b],pc=halfspaces[c],bc=Cross(pb,pc),ca=Cross(pc,pa),ab=Cross(pa,pb),det=Dot(pa,bc);
  if(Math.abs(det)<1e-10)continue;
  const point=[0,1,2].map(i=>(-pa[3]*bc[i]-pb[3]*ca[i]-pc[3]*ab[i])/det);
  if(halfspaces.every(p=>Dot(p,point)+p[3]>=-1e-7))vertices.push(point);
 }
 return vertices;
}
function AssertProjected(fit,source,point,message,circular=true){
 const distance=Math.hypot(...point),depth=Dot(fit.direction,point),matrix=Projection(fit,source),p=point.map((x,i)=>x+[source.x,source.y,source.z][i]);
 assert.ok(depth>=cfg.nearM-1e-7&&depth<=fit.far+1e-7,message+' depth');
 if(circular)assert.ok(depth/distance>=Math.cos(fit.angle)-1e-8,message+' angle');
 const clip=[0,1,2,3].map(row=>matrix[row]*p[0]+matrix[row+4]*p[1]+matrix[row+8]*p[2]+matrix[row+12]);
 assert.ok(clip[3]>0&&Math.abs(clip[0])<=clip[3]+1e-7&&Math.abs(clip[1])<=clip[3]+1e-7&&Math.abs(clip[2])<=clip[3]+1e-7,message+' projection');
}
const enclosedPlanes=[[1,0,0,-90],[-1,0,0,110],[0,1,0,3],[0,-1,0,3],[0,0,1,5],[0,0,-1,5]];
const enclosingBox={min:{x:80,y:-100,z:-100},max:{x:120,y:100,z:100}},noBias={...cfg,normalBiasM:0};
const enclosedFit=FitReceiverCone(source,600,[enclosingBox],enclosedPlanes,noBias);
assert.ok(enclosedFit&&enclosedFit.angle<.08&&enclosedFit.far<113,'Full frustum inside a box must create all cut faces and discard invisible extents');
for(const point of ClippedVertices(enclosingBox,source,600,enclosedPlanes,0))AssertProjected(enclosedFit,source,point,'Frustum-contained receiver');
assert.ok(ReceiverConeCovered(Projection(enclosedFit,source),source,600,[enclosingBox],{planes:enclosedPlanes},noBias),'Frustum objects and plane arrays have the same coverage contract');
assert.equal(ReceiverConeCovered(Projection(enclosedFit,source),source,600,[enclosingBox],enclosedPlanes[0],noBias),false,'Offscreen box extents must no longer enlarge a frustum-certified projection');
for(const outside of [
 {min:{x:111,y:-1,z:-1},max:{x:120,y:1,z:1}},
 {min:{x:95,y:4,z:-1},max:{x:100,y:5,z:1}},
 {min:{x:95,y:-1,z:6},max:{x:100,y:1,z:7}}
])assert.equal(FitReceiverCone(source,600,[outside],enclosedPlanes,noBias),null,'Each far / vertical / horizontal camera plane must reject invisible receivers');
const planarBox={min:{x:80,y:0,z:-100},max:{x:120,y:0,z:100}},planarFit=FitReceiverCone(source,600,[planarBox],enclosedPlanes,noBias);
assert.ok(planarFit,'Zero-thickness receiver faces must survive clipping');
for(const point of ClippedVertices(planarBox,source,600,enclosedPlanes,0))AssertProjected(planarFit,source,point,'Planar receiver');

let fullAccepted=0,oracleVertices=0,biasedSamples=0;
for(let trial=0;trial<1100;trial++){
 const source={x:(Random()-.5)*1000,y:30+Random()*150,z:(Random()-.5)*1000},radius=100+Random()*500;
 const angle=Random()*Math.PI*2,forward=[Math.cos(angle),0,Math.sin(angle)],right=Cross(forward,[0,1,0]),up=Cross(right,forward);
 const eye=[source.x-forward[0]*25,1.7,source.z-forward[2]*25],far=80+Random()*450,sx=.25+Random()*.7,sy=.2+Random()*.7;
 const normals=[forward,forward.map(x=>-x),Normal(forward.map((x,i)=>sx*x+right[i])),Normal(forward.map((x,i)=>sx*x-right[i])),
  Normal(forward.map((x,i)=>sy*x+up[i])),Normal(forward.map((x,i)=>sy*x-up[i]))];
 const planes=normals.map((n,i)=>[...n,-Dot(n,eye)+(i===0?-.05:i===1?far:0)]),boxes=[];
 for(let b=0;b<4;b++){
  const distance=Random()*550-70,side=(Random()-.5)*250,extent=5+Random()*130;
  const center=[source.x+forward[0]*distance+right[0]*side,Random()*8,source.z+forward[2]*distance+right[2]*side];
  boxes.push({min:{x:center[0]-extent,y:center[1]-.5,z:center[2]-extent},max:{x:center[0]+extent,y:center[1]+2,z:center[2]+extent}});
 }
 const fit=FitReceiverCone(source,radius,boxes,planes,cfg);if(!fit)continue;fullAccepted++;
 assert.ok(ReceiverConeCovered(Projection(fit,source),source,radius,boxes,planes,cfg),'Fresh full-frustum fit must cover its own receiver certificate');
 for(const box of boxes){
  for(const point of ClippedVertices(box,source,radius,planes,cfg.normalBiasM)){oracleVertices++;AssertProjected(fit,source,point,'Independent halfspace intersection');}
  for(let i=0;i<30;i++){
   const p=[box.min.x+Random()*(box.max.x-box.min.x),box.min.y+Random()*(box.max.y-box.min.y),box.min.z+Random()*(box.max.z-box.min.z)];
   if(!planes.every(plane=>Dot(plane,p)+plane[3]>=0))continue;
   const normal=Normal([Random()-.5,Random()-.5,Random()-.5]),point=p.map((x,j)=>x+normal[j]*cfg.normalBiasM-[source.x,source.y,source.z][j]);
   if(Math.max(...point.map(Math.abs))>radius)continue;
   biasedSamples++;AssertProjected(fit,source,point,'Visible fragment displaced by arbitrary surface normal');
  }
 }
}
assert.ok(fullAccepted>400&&oracleVertices>20000&&biasedSamples>10000,`Full-frustum fuzz must exercise clipping and bias with substantial independent coverage: ${JSON.stringify({fullAccepted,oracleVertices,biasedSamples})}`);
assert.equal(FitReceiverCone(source,600,single,[[0,0,0,1]],cfg),null,'Invalid camera planes must request the safe fallback');

function ShadowHalfspaces(source,direction,angle,far,bias){
 const axis=Normal(direction),right=Normal(Cross(axis,Math.abs(axis[1])>.9?[0,0,1]:[0,1,0])),up=Cross(right,axis),tangent=Math.tan(angle);
 return [[...axis,-cfg.nearM],[...axis.map(x=>-x),far],
  ...[right,right.map(x=>-x),up,up.map(x=>-x)].map(side=>[...axis.map((x,i)=>x*tangent+side[i]),0])]
  .map(plane=>[...plane.slice(0,3),plane[3]-Dot(plane,[source.x,source.y,source.z])-bias*Math.hypot(...plane.slice(0,3))]);
}
const nearSource={x:100,y:120,z:0},down=[0,-1,0],nearAngle=Math.atan2(110,120),nearConfig={...cfg,projectionFarM:180};
const nearCrop=FitReceiverProjection(nearSource,600,[enclosingBox],enclosedPlanes,down,nearAngle,nearConfig);
assert.ok(nearCrop&&nearCrop.maxU-nearCrop.minU<.2&&nearCrop.maxV-nearCrop.minV<.12&&nearCrop.far<=180,'Near map must crop to camera-visible receivers and retain its fixed depth limit');
assert.ok(ReceiverConeCovered(Projection(nearCrop,nearSource),nearSource,600,[enclosingBox],enclosedPlanes,cfg),'Near map crop must retain every visible receiver in its original pyramid');
const outsideNear=[{min:{x:400,y:-2,z:-1},max:{x:410,y:2,z:1}}];
assert.equal(FitReceiverProjection(nearSource,600,outsideNear,null,down,nearAngle,nearConfig),null,'Empty fixed near pyramid must allow skipping the auxiliary map');
let fixedAccepted=0,fixedOracleVertices=0;
for(let trial=0;trial<500;trial++){
 const source={x:(Random()-.5)*100,y:30+Random()*140,z:(Random()-.5)*100},angle=.3+Random()*.9,far=source.y+20+Random()*100;
 const boxes=[];
 for(let b=0;b<3;b++){
  const center=[source.x+(Random()-.5)*350,Random()*20,source.z+(Random()-.5)*350],extent=10+Random()*100;
  boxes.push({min:{x:center[0]-extent,y:center[1]-1,z:center[2]-extent},max:{x:center[0]+extent,y:center[1]+2,z:center[2]+extent}});
 }
 const observer=[[1,0,0,80-source.x],[-1,0,0,140+source.x],[0,1,0,5],[0,-1,0,40],[0,0,1,120-source.z],[0,0,-1,120+source.z]];
 const fit=FitReceiverProjection(source,600,boxes,observer,down,angle,{...cfg,projectionFarM:far});if(!fit)continue;fixedAccepted++;
 const allPlanes=[...observer,...ShadowHalfspaces(source,down,angle,far,cfg.normalBiasM)];
 for(const box of boxes)for(const point of ClippedVertices(box,source,600,allPlanes,cfg.normalBiasM)){
  fixedOracleVertices++;AssertProjected(fit,source,point,'Independent fixed near-pyramid intersection',false);
 }
}
assert.ok(fixedAccepted>300&&fixedOracleVertices>6000,`Fixed projection clipping must exercise both frusta: ${JSON.stringify({fixedAccepted,fixedOracleVertices})}`);
const report={accepted,samples,coveredOwnProjection,movingReuses,fullAccepted,oracleVertices,biasedSamples,fixedAccepted,fixedOracleVertices,seed};console.log('FlareShadowBoundsTest passed',JSON.stringify(report));
