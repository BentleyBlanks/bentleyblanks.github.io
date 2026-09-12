// 毫米制黏弹凝胶：四面体近似不可压缩，剪切可松弛，附着受局部反力剥离。
import {WaxPhysicsMaterial} from './Data_WaxPhysicsSettings.mjs?v=ear028-physics-settings-20260912';
const Add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],Sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],Mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const Dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const Length=a=>Math.hypot(...a),Clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
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
  const weights=points.map((_,i)=>new Map([[i,1]])),neighbors=points.map(()=>new Set()),edges=new Map();
  for(const [a,b,c] of faces)for(const [i,j,k] of [[a,b,c],[b,c,a],[c,a,b]]){neighbors[i].add(j);neighbors[j].add(i);const key=[i,j].sort((x,y)=>x-y).join(':');if(!edges.has(key))edges.set(key,{i,j,opposite:[]});edges.get(key).opposite.push(k);}
  const bindings=weights.map((_,i)=>{const n=neighbors[i].size,beta=n===3?3/16:3/(8*n);return {ids:[i,...neighbors[i]],weights:[1-n*beta,...Array(n).fill(beta)]};});
  for(const edge of edges.values()){edge.node=bindings.length;bindings.push({ids:[edge.i,edge.j,...edge.opposite],weights:[.375,.375,.125,.125]});}
  const mid=(i,j)=>edges.get([i,j].sort((x,y)=>x-y).join(':')).node,next=[];
  for(const [a,b,c] of faces){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}
  return {bindings,indices:Uint16Array.from(next.flat()),positions:new Float32Array(bindings.length*3),thickness:new Float32Array(bindings.length)};
}
export function BindSlimeVolume(body,positions,indices){
  const lattice=body.volumeMesh;delete body.volumeMesh;
  const rest=Array.from({length:positions.length/3},(_,i)=>Array.from(positions.slice(i*3,i*3+3))),faces=Array.from({length:indices.length/3},(_,i)=>Array.from(indices.slice(i*3,i*3+3))),render=Subdivision(rest,faces);
  const center=rest.reduce((p,v)=>Add(p,Mul(v,1/rest.length)),[0,0,0]),centerId=rest.length;if(!lattice)rest.push(center);
  const points=rest.map(p=>Add(body.position,Rotate(body.rotation,p))),tetrahedra=(lattice?.tetrahedra||faces.map(f=>[centerId,...f])).map(t=>{const ids=t.slice();if(Volume(rest,ids)<0)[ids[1],ids[2]]=[ids[2],ids[1]];return{ids,rest:Volume(rest,ids),lambda:0};}),edges=new Map();
  for(const t of tetrahedra)for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const i=t.ids[a],j=t.ids[b],key=[i,j].sort((a,b)=>a-b).join(':');if(!edges.has(key)){const length=Length(Sub(rest[i],rest[j]));edges.set(key,{i,j,rest:length,memory:length,lambda:0});}}
  const used=new Set();
  if(lattice)body.anchors=lattice.anchors.map(a=>({...a,alive:true,strain:0}));
  for(const anchor of body.anchors){let node=anchor.node??0,best=Infinity;if(!lattice)for(let i=0;i<centerId;i++){const p=rest[i],d=(p[0]-anchor.local[0])**2+(p[1]-anchor.local[1])**2+p[2]**2*2;if(!used.has(i)&&d<best){node=i;best=d;}}used.add(node);anchor.node=node;anchor.local=rest[node].slice();anchor.rest=points[node].slice();anchor.lambda=[0,0,0];anchor.damage=0;}
  body.gel={points,rest,coating:!!lattice,nodeThickness:lattice?.thickness||null,surfaceCount:centerId,velocities:points.map(()=>[0,0,0]),tetrahedra,edges:[...edges.values()],render,faces,grip:null,volume:tetrahedra.reduce((s,t)=>s+t.rest,0),volumeRatio:1,minJacobian:1,maxStretch:0,peakStretch:0,motion:0,releaseClock:0,awake:0};
  WriteSlimeSurface(body,render.positions);render.rest=render.positions.slice();return render;
}
export function GripSlimeVolume(body,point){
  const s=body.gel,nearest=s.points.slice(0,s.surfaceCount).map((p,i)=>({i,d:Length(Sub(p,point))})).sort((a,b)=>a.d-b.d).slice(0,4),raw=nearest.map(({d})=>1/(.025+d*d)),sum=raw.reduce((a,b)=>a+b,0),weights=raw.map(w=>w/sum),ids=nearest.map(n=>n.i),p=ids.reduce((p,id,i)=>Add(p,Mul(s.points[id],weights[i])),[0,0,0]);
  s.grip={ids,weights,offset:Sub(point,p),lambda:[0,0,0]};body.grip=Rotate(Inverse(body.rotation),Sub(point,body.position));s.awake=2;
}
export function UngripSlimeVolume(body){body.gel.grip=null;body.grip=null;body.gel.awake=3;}

function Edge(s,c,alpha,mass){const a=s.points[c.i],b=s.points[c.j],x=a[0]-b[0],y=a[1]-b[1],z=a[2]-b[2],length=Math.hypot(x,y,z);if(length<1e-9)return;const dl=(-(length-c.memory)-alpha*c.lambda)/(2*mass+alpha);c.lambda+=dl;const k=dl*mass/length;a[0]+=x*k;a[1]+=y*k;a[2]+=z*k;b[0]-=x*k;b[1]-=y*k;b[2]-=z*k;}
function Tetrahedron(s,t,alpha,mass,barrier=false){
  // 热循环不创建临时向量；每帧一万余次体积投影不会再制造十万余个短命数组。
  const a=s.points[t.ids[0]],b=s.points[t.ids[1]],c=s.points[t.ids[2]],d=s.points[t.ids[3]],bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2],cx=c[0]-a[0],cy=c[1]-a[1],cz=c[2]-a[2],dx=d[0]-a[0],dy=d[1]-a[1],dz=d[2]-a[2];
  const gbx=(cy*dz-cz*dy)/6,gby=(cz*dx-cx*dz)/6,gbz=(cx*dy-cy*dx)/6,gcx=(dy*bz-dz*by)/6,gcy=(dz*bx-dx*bz)/6,gcz=(dx*by-dy*bx)/6,gdx=(by*cz-bz*cy)/6,gdy=(bz*cx-bx*cz)/6,gdz=(bx*cy-by*cx)/6,gax=-gbx-gcx-gdx,gay=-gby-gcy-gdy,gaz=-gbz-gcz-gdz;
  const v=bx*gbx+by*gby+bz*gbz;if(barrier&&v>=t.rest*.25)return;
  const weight=(gax*gax+gay*gay+gaz*gaz+gbx*gbx+gby*gby+gbz*gbz+gcx*gcx+gcy*gcy+gcz*gcz+gdx*gdx+gdy*gdy+gdz*gdz)*mass,dl=barrier?-(v-t.rest*.25)/Math.max(1e-14,weight):(-(v-t.rest)-alpha*t.lambda)/(weight+alpha),correction=dl*mass;if(!barrier)t.lambda+=dl;
  a[0]+=gax*correction;a[1]+=gay*correction;a[2]+=gaz*correction;b[0]+=gbx*correction;b[1]+=gby*correction;b[2]+=gbz*correction;c[0]+=gcx*correction;c[1]+=gcy*correction;c[2]+=gcz*correction;d[0]+=gdx*correction;d[1]+=gdy*correction;d[2]+=gdz*correction;
}
function Pin(s,ids,weights,target,lambda,alpha,mass,cap=Infinity){
  const p=[0,0,0];let w=0;for(let j=0;j<ids.length;j++){w+=weights[j]**2*mass;for(let k=0;k<3;k++)p[k]+=s.points[ids[j]][k]*weights[j];}
  const next=lambda.map((v,k)=>v+(-(p[k]-target[k])-alpha*v)/(w+alpha)),length=Length(next);if(length>cap)for(let k=0;k<3;k++)next[k]*=cap/length;
  for(let k=0;k<3;k++){const dl=next[k]-lambda[k];lambda[k]=next[k];for(let j=0;j<ids.length;j++)s.points[ids[j]][k]+=dl*weights[j]*mass;}
}
export function StepSlimeVolume(body,{target=null,efficiency=1,adhesion=1,minAnchors=0,softness=0,gravity=[0,-1.5,0],floor=null}={},dt=1/60){
  const s=body.gel,physics=WaxPhysicsMaterial('oily'),duration=Clamp(dt,0,.05),count=Math.max(1,Math.ceil(duration*240)),h=duration/count;
  if(!h)return{detached:body.detached,remaining:body.anchors.filter(a=>a.alive).length,strain:Clamp(body.strain),force:body.force,contact:body.contact};
  const mass=s.points.length,h2=h*h,edgeAlpha=(s.coating?.006:.06)*(1+softness*.6)/(physics.stretch*h2),volumeAlpha=(s.coating?1e-12:2e-10)/h2;
  body.contact=false;body.strain=0;body.softness=softness;
  for(let step=0;step<count;step++){
    const before=s.points.map(p=>p.slice()),damping=Math.exp(-h*physics.damping);
    const planes=s.collider?s.points.map(p=>({point:p.slice(),...s.collider(p)})):null;
    for(let i=0;i<s.points.length;i++)for(let k=0;k<3;k++)s.points[i][k]+=s.velocities[i][k]*h*damping+gravity[k]*h2;
    for(const c of s.edges)c.lambda=0;for(const t of s.tetrahedra)t.lambda=0;for(const a of body.anchors)a.lambda.fill(0);if(s.grip)s.grip.lambda.fill(0);
    for(let iteration=0;iteration<(s.coating?16:8);iteration++){
      for(const c of s.edges)Edge(s,c,edgeAlpha,mass);
      for(const t of s.tetrahedra)Tetrahedron(s,t,volumeAlpha,mass);
      for(const a of body.anchors)if(a.alive)Pin(s,[a.node],[1],a.rest,a.lambda,2e-6/Math.max(.05,adhesion)/h2,mass);
      if(s.grip&&target)Pin(s,s.grip.ids,s.grip.weights,Sub(target,s.grip.offset),s.grip.lambda,.0015/Math.max(.03,efficiency)/h2,mass,90*h2);
      // 贴壁以每个节点的初始曲面为下界；脱开后由当前管壁/托盘接触面接管。
      if(planes){for(let i=0;i<s.points.length;i++){const plane=planes[i],depth=plane.clearance+Dot(Sub(s.points[i],plane.point),plane.normal)-.012;if(depth<0){for(let k=0;k<3;k++)s.points[i][k]-=plane.normal[k]*depth;body.contact=true;}}}
      else if(!body.detached)for(let i=0;i<s.points.length;i++){const support=Add(body.origin,Rotate(body.restRotation,[s.rest[i][0],s.rest[i][1],Math.min(s.rest[i][2],.025)])),depth=Dot(Sub(s.points[i],support),body.normal);if(depth<0){for(let k=0;k<3;k++)s.points[i][k]-=body.normal[k]*depth;body.contact=true;}}
      if(floor!==null)for(const p of s.points)if(p[1]<floor){p[1]=floor;body.contact=true;}
    }
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
    for(const a of body.anchors)if(a.alive){remaining++;const f=Mul(a.lambda,-1/h2),n=a.normal||body.normal,normal=Dot(f,n),slide=Length(Sub(f,Mul(n,normal)));a.strain=(Math.max(0,normal)+slide*.3)/((a.strength||18)*physics.adhesion*Math.sqrt(adhesion)*(1-softness*.3));a.damage=Math.max(0,a.damage+h*Math.max(-.3,a.strain-.75));if(a.strain>largest){largest=a.strain;candidate=a;}}
    s.releaseClock=Math.max(0,s.releaseClock-h);
    if(s.grip&&target&&candidate&&remaining>minAnchors&&s.releaseClock===0&&(candidate.strain>2||candidate.damage>.065)){candidate.alive=false;s.releaseClock=.045;}
    body.strain=Math.max(body.strain,largest);body.force=s.grip&&target?Math.min(90,Length(s.grip.lambda)/h2):0;body.detached=body.anchors.every(a=>!a.alive);
    s.motion=0;
    for(let i=0;i<s.points.length;i++){s.velocities[i]=Mul(Sub(s.points[i],before[i]),1/h);const speed=Length(s.velocities[i]);if(speed>24)s.velocities[i]=Mul(s.velocities[i],24/speed);s.motion=Math.max(s.motion,speed);}
    // 沿材料边交换动量，抑制水样振荡；等量反向交换不会凭空推动整块。
    for(const c of s.edges){const a=s.velocities[c.i],b=s.velocities[c.j],factor=.035*physics.viscosity;for(let k=0;k<3;k++){const d=(a[k]-b[k])*factor;a[k]-=d;b[k]+=d;}}
    for(const c of s.edges){const length=Length(Sub(s.points[c.i],s.points[c.j])),desired=Clamp(length,c.rest*.65,c.rest*1.75);c.memory+=(desired-c.memory)*(1-Math.exp(-h*physics.relaxation));c.memory+=(c.rest-c.memory)*(1-Math.exp(-h*physics.recovery));}
    body.steps++;
  }
  const previous=body.position,center=s.points.reduce((p,v)=>Add(p,Mul(v,1/s.points.length)),[0,0,0]),restCenter=s.rest.reduce((p,v)=>Add(p,Mul(v,1/s.rest.length)),[0,0,0]);body.position=Sub(center,Rotate(body.rotation,restCenter));body.velocity=Mul(Sub(body.position,previous),1/duration);body.motion=s.motion;body.spin=[0,0,0];
  if(s.grip){const p=s.grip.ids.reduce((p,id,i)=>Add(p,Mul(s.points[id],s.grip.weights[i])),s.grip.offset.slice());body.grip=Rotate(Inverse(body.rotation),Sub(p,body.position));}
  s.volumeRatio=s.tetrahedra.reduce((sum,t)=>sum+Volume(s.points,t.ids),0)/s.volume;s.minJacobian=Math.min(...s.tetrahedra.map(t=>Volume(s.points,t.ids)/t.rest));s.maxStretch=Math.max(...s.edges.map(c=>Length(Sub(s.points[c.i],s.points[c.j]))/c.rest));s.peakStretch=Math.max(s.peakStretch,s.maxStretch);s.awake=Math.max(0,s.awake-duration);
  return {detached:body.detached,remaining:body.anchors.filter(a=>a.alive).length,strain:Clamp(body.strain),force:body.force,contact:body.contact};
}
export function WriteSlimeSurface(body,positions){
  const s=body.gel,inverse=Inverse(body.rotation),stretch=new Float32Array(s.points.length).fill(1);
  for(const e of s.edges){const ratio=Length(Sub(s.points[e.i],s.points[e.j]))/e.rest;stretch[e.i]=Math.max(stretch[e.i],ratio);stretch[e.j]=Math.max(stretch[e.j],ratio);}
  for(let i=0;i<s.render.bindings.length;i++){const b=s.render.bindings[i],p=[0,0,0];let thickness=0;for(let j=0;j<b.ids.length;j++){const id=b.ids[j],w=b.weights[j],rest=s.rest[id];for(let k=0;k<3;k++)p[k]+=s.points[id][k]*w;const radial=(rest[0]/(body.size*1.5))**2+(rest[1]/(body.size*1.8))**2;thickness+=w*(s.nodeThickness?s.nodeThickness[id]:Math.sqrt(Math.max(.025,1-radial)))/Math.sqrt(stretch[id]);}positions.set(Rotate(inverse,Sub(p,body.position)),i*3);s.render.thickness[i]=thickness;}
}
export function PoseSlimeVolume(body,position,rotation){const s=body.gel,inverse=Inverse(body.rotation);for(let i=0;i<s.points.length;i++){s.points[i]=Add(position,Rotate(rotation,Rotate(inverse,Sub(s.points[i],body.position))));s.velocities[i]=Rotate(rotation,Rotate(inverse,s.velocities[i]));}if(s.grip)s.grip.offset=Rotate(rotation,Rotate(inverse,s.grip.offset));body.position=position.slice();body.rotation=rotation.slice();}
export function CloneSlimeVolume(body,position){const copy=structuredClone({...body,gel:{...body.gel,collider:null}});UngripSlimeVolume(copy);PoseSlimeVolume(copy,position,body.rotation);copy.gel.awake=1.5;return copy;}
