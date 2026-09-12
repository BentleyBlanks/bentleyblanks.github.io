// 毫米制黏弹凝胶：四面体近似不可压缩，剪切可松弛，附着受局部反力剥离。
import {ProjectSlimeConstraints} from './Script_SlimeConstraints.mjs?v=ear038-oily-performance-20260912';
import {WaxPhysicsMaterial} from './Data_WaxPhysicsSettings.mjs?v=ear028-physics-settings-20260912';
import {PlanSlimeBite,UpdateSlimeBite,PartitionSlimeBite} from './Script_SlimeBite.mjs?v=ear038-oily-performance-20260912';
const Add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],Sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],Mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const Dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Solver coordinates are bounded millimetres; direct norms avoid the generic
// overflow/scaling path in Math.hypot for every edge in every XPBD iteration.
const Length=a=>Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]),Clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const EdgeKey=(a,b)=>Math.min(a,b)*65536+Math.max(a,b);
const Inverse=q=>[-q[0],-q[1],-q[2],q[3]];
function Rotate(q,v){const t=Mul(Cross(q,v),2);return Add(v,Add(Mul(t,q[3]),Cross(q,t)));}
function Volume(points,ids){const a=points[ids[0]],b=points[ids[1]],c=points[ids[2]],d=points[ids[3]],bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2],cx=c[0]-a[0],cy=c[1]-a[1],cz=c[2]-a[2],dx=d[0]-a[0],dy=d[1]-a[1],dz=d[2]-a[2];return(bx*(cy*dz-cz*dy)+by*(cz*dx-cx*dz)+bz*(cx*dy-cy*dx))/6;}

export function SlimeCage(size=1,seed=0){
  const t=(1+Math.sqrt(5))/2;
  let points=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(p=>Mul(p,1/Length(p)));
  let faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let level=0;level<2;level++){
    const cache=new Map(),next=[];
    function Mid(a,b){const key=[a,b].sort((x,y)=>x-y).join(':');if(cache.has(key))return cache.get(key);const p=Add(points[a],points[b]),id=points.length;points.push(Mul(p,1/Length(p)));cache.set(key,id);return id;}
    for(const [a,b,c] of faces){const ab=Mid(a,b),bc=Mid(b,c),ca=Mid(c,a);next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}faces=next;
  }
  points=points.map(([x,y,z])=>{const lobe=1+.13*Math.sin(y*3+seed)+.07*Math.sin(x*5-y*2+seed*2);return [x*size*1.35*lobe,y*size*1.58*lobe, size*(.40+z*.39)*(1+.12*Math.sin(x*4+seed))];});
  return {positions:Float32Array.from(points.flat()),indices:Uint16Array.from(faces.flat())};
}

// Loop 细分的权重只建立一次；每帧直接由体积节点写曲面，表面与体积不会各自摆动。
function Subdivision(points,faces){
  const neighbors=points.map(()=>new Set()),edges=new Map();
  for(const [a,b,c] of faces)for(const [i,j,k] of [[a,b,c],[b,c,a],[c,a,b]]){neighbors[i].add(j);neighbors[j].add(i);const key=EdgeKey(i,j);if(!edges.has(key))edges.set(key,{i,j,opposite:[]});edges.get(key).opposite.push(k);}
  const bindings=points.map((_,i)=>{const n=neighbors[i].size,beta=n===3?3/16:3/(8*n);return {ids:[i,...neighbors[i]],weights:[1-n*beta,...Array(n).fill(beta)]};});
  for(const edge of edges.values()){edge.node=bindings.length;bindings.push({ids:[edge.i,edge.j,...edge.opposite],weights:[.375,.375,.125,.125]});}
  const mid=(i,j)=>edges.get(EdgeKey(i,j)).node,next=[];
  for(const [a,b,c] of faces){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}
  return {bindings,indices:Uint16Array.from(next.flat()),positions:new Float32Array(bindings.length*3),thickness:new Float32Array(bindings.length)};
}
export function BindSlimeVolume(body,positions,indices){
  const lattice=body.volumeMesh;delete body.volumeMesh;
  const rest=Array.from({length:positions.length/3},(_,i)=>Array.from(positions.slice(i*3,i*3+3))),faces=Array.from({length:indices.length/3},(_,i)=>Array.from(indices.slice(i*3,i*3+3))),render=Subdivision(rest,faces);
  const center=rest.reduce((p,v)=>Add(p,Mul(v,1/rest.length)),[0,0,0]),centerId=rest.length;if(!lattice)rest.push(center);
  const points=rest.map(p=>Add(body.position,Rotate(body.rotation,p))),tetrahedra=(lattice?.tetrahedra||faces.map(f=>[centerId,...f])).map(t=>{const ids=t.slice();if(Volume(rest,ids)<0)[ids[1],ids[2]]=[ids[2],ids[1]];return{ids,rest:Volume(rest,ids),lambda:0};}),edges=new Map();
  for(const t of tetrahedra)for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const i=t.ids[a],j=t.ids[b],key=EdgeKey(i,j);if(!edges.has(key)){const length=Length(Sub(rest[i],rest[j]));edges.set(key,{i,j,rest:length,memory:length,lambda:0});}}
  const used=new Set();
  if(lattice)body.anchors=lattice.anchors.map(a=>({...a,alive:true,strain:0}));
  for(const anchor of body.anchors){let node=anchor.node??0,best=Infinity;if(!lattice)for(let i=0;i<centerId;i++){const p=rest[i],d=(p[0]-anchor.local[0])**2+(p[1]-anchor.local[1])**2+p[2]**2*2;if(!used.has(i)&&d<best){node=i;best=d;}}used.add(node);anchor.node=node;anchor.local=rest[node].slice();anchor.rest=points[node].slice();anchor.lambda=[0,0,0];anchor.damage=0;}
  body.gel={points,rest,coating:!!lattice,cells:lattice?.cells||null,nodeThickness:lattice?.thickness||null,surfaceCount:centerId,velocities:points.map(()=>[0,0,0]),tetrahedra,edges:[...edges.values()],render,faces,grip:null,volume:tetrahedra.reduce((s,t)=>s+t.rest,0),volumeRatio:1,minJacobian:1,maxStretch:0,peakStretch:0,motion:0,releaseClock:0,awake:0};
  WriteSlimeSurface(body,render.positions);render.rest=render.positions.slice();return render;
}
export function GripSlimeVolume(body,point){
  const s=body.gel,nearest=s.points.slice(0,s.surfaceCount).map((p,i)=>({i,d:Length(Sub(p,point))})).sort((a,b)=>a.d-b.d).slice(0,4),raw=nearest.map(({d})=>1/(.025+d*d)),sum=raw.reduce((a,b)=>a+b,0),weights=raw.map(w=>w/sum),ids=nearest.map(n=>n.i),p=ids.reduce((p,id,i)=>Add(p,Mul(s.points[id],weights[i])),[0,0,0]);
  s.grip={ids,weights,offset:Sub(point,p),lambda:[0,0,0]};body.grip=Rotate(Inverse(body.rotation),Sub(point,body.position));s.awake=2;
  if(s.cells)PlanSlimeBite(body);
}
export function UngripSlimeVolume(body){body.gel.grip=null;body.gel.bite=null;body.grip=null;body.gel.awake=3;}

function Tetrahedron(s,t,alpha,mass,barrier=false){
  // 热循环不创建临时向量；每帧一万余次体积投影不会再制造十万余个短命数组。
  const a=s.points[t.ids[0]],b=s.points[t.ids[1]],c=s.points[t.ids[2]],d=s.points[t.ids[3]],bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2],cx=c[0]-a[0],cy=c[1]-a[1],cz=c[2]-a[2],dx=d[0]-a[0],dy=d[1]-a[1],dz=d[2]-a[2];
  const gbx=(cy*dz-cz*dy)/6,gby=(cz*dx-cx*dz)/6,gbz=(cx*dy-cy*dx)/6,gcx=(dy*bz-dz*by)/6,gcy=(dz*bx-dx*bz)/6,gcz=(dx*by-dy*bx)/6,gdx=(by*cz-bz*cy)/6,gdy=(bz*cx-bx*cz)/6,gdz=(bx*cy-by*cx)/6,gax=-gbx-gcx-gdx,gay=-gby-gcy-gdy,gaz=-gbz-gcz-gdz;
  const v=bx*gbx+by*gby+bz*gbz;if(barrier&&v>=t.rest*.25)return;
  const weight=(gax*gax+gay*gay+gaz*gaz+gbx*gbx+gby*gby+gbz*gbz+gcx*gcx+gcy*gcy+gcz*gcz+gdx*gdx+gdy*gdy+gdz*gdz)*mass,dl=barrier?-(v-t.rest*.25)/Math.max(1e-14,weight):(-(v-t.rest)-alpha*t.lambda)/(weight+alpha),correction=dl*mass;if(!barrier)t.lambda+=dl;
  a[0]+=gax*correction;a[1]+=gay*correction;a[2]+=gaz*correction;b[0]+=gbx*correction;b[1]+=gby*correction;b[2]+=gbz*correction;c[0]+=gcx*correction;c[1]+=gcy*correction;c[2]+=gcz*correction;d[0]+=gdx*correction;d[1]+=gdy*correction;d[2]+=gdz*correction;
}
// 闭合断口的表面张力来自实际三角面积梯度；三角内的合力为零。
// 仅离壁小团启用，凝胶慢慢收拢，不能把贴壁薄膜也拉成珠子。
function SurfaceTension(s,scale){
 for(const [ia,ib,ic] of s.faces){
  const a=s.points[ia],b=s.points[ib],c=s.points[ic],abx=b[0]-a[0],aby=b[1]-a[1],abz=b[2]-a[2],acx=c[0]-a[0],acy=c[1]-a[1],acz=c[2]-a[2];
  const cx=aby*acz-abz*acy,cy=abz*acx-abx*acz,cz=abx*acy-aby*acx,length=Math.sqrt(cx*cx+cy*cy+cz*cz);if(length<1e-10)continue;
  const nx=cx/length,ny=cy/length,nz=cz/length,bax=b[0]-c[0],bay=b[1]-c[1],baz=b[2]-c[2];
  a[0]-=(bay*nz-baz*ny)*.5*scale;a[1]-=(baz*nx-bax*nz)*.5*scale;a[2]-=(bax*ny-bay*nx)*.5*scale;
  b[0]-=(acy*nz-acz*ny)*.5*scale;b[1]-=(acz*nx-acx*nz)*.5*scale;b[2]-=(acx*ny-acy*nx)*.5*scale;
  c[0]-=(-aby*nz+abz*ny)*.5*scale;c[1]-=(-abz*nx+abx*nz)*.5*scale;c[2]-=(-abx*ny+aby*nx)*.5*scale;
 }
}
export function StepSlimeVolume(body,{target=null,efficiency=1,adhesion=1,minAnchors=0,softness=0,gravity=[0,-1.5,0],floor=null}={},dt=1/60){
  const s=body.gel,physics=WaxPhysicsMaterial('oily'),duration=Clamp(dt,0,.05),count=Math.max(1,Math.ceil(duration*240)),h=duration/count;
  if(!h)return{detached:body.detached,remaining:body.anchors.filter(a=>a.alive).length,strain:Clamp(body.strain),force:body.force,contact:body.contact};
  const mass=s.points.length,h2=h*h,edgeAlpha=(s.coating?(s.cells?.006:.035):.06)*(1+softness*.6)/(physics.stretch*h2),volumeAlpha=(s.coating?1e-12:2e-10)/h2;
  const gripTarget=s.grip&&target?Sub(target,s.grip.offset):null,damping=Math.exp(-h*physics.damping),relaxation=1-Math.exp(-h*physics.relaxation),recovery=1-Math.exp(-h*physics.recovery);
  // Scratch remains local to this body and topology, including detached copies.
  const before=s.before||(s.before=s.points.map(()=>[0,0,0]));
  const supports=!s.collider&&!body.detached?s.rest.map(p=>Add(body.origin,Rotate(body.restRotation,[p[0],p[1],Math.min(p[2],.025)]))):null;
  body.contact=false;body.strain=0;body.softness=softness;
  for(let step=0;step<count;step++){
    for(let i=0;i<s.points.length;i++){const p=s.points[i],v=before[i];v[0]=p[0];v[1]=p[1];v[2]=p[2];}
    const planes=s.collider?s.points.map(p=>({point:p.slice(),...s.collider(p)})):null;
    for(let i=0;i<s.points.length;i++)for(let k=0;k<3;k++)s.points[i][k]+=s.velocities[i][k]*h*damping+gravity[k]*h2;
    if(s.coating&&!s.cells)SurfaceTension(s,8*mass*h2);
    for(const c of s.edges)c.lambda=0;for(const t of s.tetrahedra)t.lambda=0;for(const a of body.anchors)a.lambda.fill(0);if(s.grip)s.grip.lambda.fill(0);
    ProjectSlimeConstraints(body,{edgeAlpha,volumeAlpha,adhesion,efficiency,h2,gripTarget,planes,supports,floor});
    if(s.coating)for(let pass=0;pass<24;pass++){
      if(!s.tetrahedra.some(t=>Volume(s.points,t.ids)<t.rest*.15))break;
      for(const t of s.tetrahedra)Tetrahedron(s,t,0,mass,true);
    }
    // Thin curved layers need an inversion-free line search after contact projection.
    // Backtrack this substep's displacement, preserving each positive tetrahedron;
    // never repair a folded cell by changing its rest volume or deleting material.
    if(s.coating&&s.tetrahedra.some(t=>Volume(s.points,t.ids)<t.rest*.08)){
      const proposed=s.points.map(p=>p.slice());let fraction=1;
      do{fraction*=.5;for(let i=0;i<s.points.length;i++)for(let k=0;k<3;k++)s.points[i][k]=before[i][k]+(proposed[i][k]-before[i][k])*fraction;}
      while(fraction>1/4096&&s.tetrahedra.some(t=>Volume(s.points,t.ids)<t.rest*.08));
      if(s.tetrahedra.some(t=>Volume(s.points,t.ids)<t.rest*.08))for(let i=0;i<s.points.length;i++)s.points[i]=before[i].slice();
      s.backtracks=(s.backtracks||0)+1;
    }
    let candidate=null,largest=0,remaining=0;
    for(const a of body.anchors)if(a.alive){remaining++;const f=Mul(a.lambda,-1/h2),n=a.normal||body.normal,normal=Dot(f,n),slide=Length(Sub(f,Mul(n,normal)));a.strain=(Math.max(0,normal)+slide*.3)/((a.strength||18)*physics.adhesion*Math.sqrt(adhesion)*(1-softness*.3));a.damage=Math.max(0,a.damage+h*Math.max(-.3,a.strain-.75));largest=Math.max(largest,a.strain);if((!s.cells||s.bite?.releaseMask[a.node])&&(!candidate||a.strain>candidate.strain))candidate=a;}
    s.releaseClock=Math.max(0,s.releaseClock-h);
    if(s.grip&&target&&candidate&&remaining>Math.max(minAnchors,s.cells?1:0)&&s.releaseClock===0&&(candidate.strain>2||candidate.damage>.065)){candidate.alive=false;s.releaseClock=.045;}
    body.strain=Math.max(body.strain,largest);body.force=s.grip&&target?Math.min(90,Length(s.grip.lambda)/h2):0;body.detached=body.anchors.every(a=>!a.alive);
    s.motion=0;
    for(let i=0;i<s.points.length;i++){const v=s.velocities[i],p=s.points[i],q=before[i];v[0]=(p[0]-q[0])/h;v[1]=(p[1]-q[1])/h;v[2]=(p[2]-q[2])/h;const speed=Length(v);if(speed>24){const scale=24/speed;v[0]*=scale;v[1]*=scale;v[2]*=scale;}s.motion=Math.max(s.motion,speed);}
    // 沿材料边交换动量，抑制水样振荡；等量反向交换不会凭空推动整块。
    for(const c of s.edges){const a=s.velocities[c.i],b=s.velocities[c.j],factor=.035*physics.viscosity;for(let k=0;k<3;k++){const d=(a[k]-b[k])*factor;a[k]-=d;b[k]+=d;}}
    for(const c of s.edges){const a=s.points[c.i],b=s.points[c.j],x=a[0]-b[0],y=a[1]-b[1],z=a[2]-b[2],length=Math.sqrt(x*x+y*y+z*z),desired=Clamp(length,c.rest*.65,c.rest*1.75);c.memory+=(desired-c.memory)*relaxation;c.memory+=(c.rest-c.memory)*recovery;}
    body.steps++;
  }
  const previous=body.position,center=s.points.reduce((p,v)=>Add(p,Mul(v,1/s.points.length)),[0,0,0]),restCenter=s.rest.reduce((p,v)=>Add(p,Mul(v,1/s.rest.length)),[0,0,0]);body.position=Sub(center,Rotate(body.rotation,restCenter));body.velocity=Mul(Sub(body.position,previous),1/duration);body.motion=s.motion;body.spin=[0,0,0];
  if(s.grip){const p=s.grip.ids.reduce((p,id,i)=>Add(p,Mul(s.points[id],s.grip.weights[i])),s.grip.offset.slice());body.grip=Rotate(Inverse(body.rotation),Sub(p,body.position));}
  s.volumeRatio=s.tetrahedra.reduce((sum,t)=>sum+Volume(s.points,t.ids),0)/s.volume;s.minJacobian=Math.min(...s.tetrahedra.map(t=>Volume(s.points,t.ids)/t.rest));s.maxStretch=Math.max(...s.edges.map(c=>Length(Sub(s.points[c.i],s.points[c.j]))/c.rest));s.peakStretch=Math.max(s.peakStretch,s.maxStretch);s.awake=Math.max(0,s.awake-duration);
  if(s.cells&&target&&minAnchors<body.anchors.length)UpdateSlimeBite(body,target);
  return {detached:body.detached,remaining:body.anchors.filter(a=>a.alive).length,strain:Clamp(body.strain),force:body.force,contact:body.contact,biteReady:!!s.bite?.ready};
}
export function WriteSlimeSurface(body,positions){
  const s=body.gel,inverse=Inverse(body.rotation),stretch=new Float32Array(s.points.length).fill(1);
  for(const e of s.edges){const ratio=Length(Sub(s.points[e.i],s.points[e.j]))/e.rest;stretch[e.i]=Math.max(stretch[e.i],ratio);stretch[e.j]=Math.max(stretch[e.j],ratio);}
  for(let i=0;i<s.render.bindings.length;i++){const b=s.render.bindings[i],p=[0,0,0];let thickness=0;for(let j=0;j<b.ids.length;j++){const id=b.ids[j],w=b.weights[j],rest=s.rest[id];for(let k=0;k<3;k++)p[k]+=s.points[id][k]*w;const radial=(rest[0]/(body.size*1.5))**2+(rest[1]/(body.size*1.8))**2;thickness+=w*(s.nodeThickness?s.nodeThickness[id]:Math.sqrt(Math.max(.025,1-radial)))/Math.sqrt(stretch[id]);}positions.set(Rotate(inverse,Sub(p,body.position)),i*3);s.render.thickness[i]=thickness;}
}
export function PoseSlimeVolume(body,position,rotation){const s=body.gel,inverse=Inverse(body.rotation);for(let i=0;i<s.points.length;i++){s.points[i]=Add(position,Rotate(rotation,Rotate(inverse,Sub(s.points[i],body.position))));s.velocities[i]=Rotate(rotation,Rotate(inverse,s.velocities[i]));}if(s.grip)s.grip.offset=Rotate(rotation,Rotate(inverse,s.grip.offset));body.position=position.slice();body.rotation=rotation.slice();}
export function CloneSlimeVolume(body,position){const copy=structuredClone({...body,gel:{...body.gel,collider:null}});UngripSlimeVolume(copy);PoseSlimeVolume(copy,position,body.rotation);copy.gel.awake=1.5;return copy;}
export function SplitSlimeBite(body){
  const parts=PartitionSlimeBite(body);if(!parts)return null;
  const source=body.gel,grip=source.grip.ids.reduce((p,id,j)=>Add(p,Mul(source.points[id],source.grip.weights[j])),source.grip.offset.slice());
  const edgeMemory=new Map(source.edges.map(e=>[EdgeKey(e.i,e.j),e.memory]));
  function Build(part){
    if(!part)return null;
    const center=part.oldNodes.reduce((p,id)=>Add(p,Mul(source.rest[id],1/part.oldNodes.length)),[0,0,0]),position=part.oldNodes.reduce((p,id)=>Add(p,Mul(source.points[id],1/part.oldNodes.length)),[0,0,0]);
    for(let i=0;i<part.positions.length;i++)part.positions[i]-=center[i%3];
    const anchors=part.anchors.map(a=>({...a,rest:a.rest.slice()}));
    const copy={...body,position,origin:position.slice(),rotation:body.rotation.slice(),restRotation:body.restRotation.slice(),velocity:body.velocity.slice(),spin:[0,0,0],anchors:[],grip:null,detached:part.held,cleanMass:(body.cleanMass||3)*part.volume/source.volume,volumeMesh:part};
    const render=BindSlimeVolume(copy,part.positions,part.indices),s=copy.gel;
    s.points=part.oldNodes.map(id=>source.points[id].slice());s.velocities=part.oldNodes.map(id=>source.velocities[id].slice());
    s.materialRest=part.oldNodes.map(id=>(source.materialRest||source.rest)[id].slice());s.collider=source.collider;s.awake=1.2;
    s.tetrahedra.forEach((t,i)=>t.rest=source.tetrahedra[part.oldTets[i]].rest);s.volume=part.volume;
    s.edges.forEach(e=>{e.memory=edgeMemory.get(EdgeKey(part.oldNodes[e.i],part.oldNodes[e.j]))??e.rest;});
    copy.anchors.forEach((a,i)=>Object.assign(a,{...anchors[i],local:s.rest[a.node].slice(),lambda:[0,0,0]}));copy.detached=part.held;
    WriteSlimeSurface(copy,render.positions);
    render.rest=Float32Array.from(render.bindings.flatMap(b=>b.ids.reduce((p,id,j)=>Add(p,Mul(s.materialRest[id],b.weights[j])),[0,0,0])));
    if(part.held)GripSlimeVolume(copy,grip);return copy;
  }
  return{bite:Build(parts.bite),remainder:Build(parts.remainder)};
}
