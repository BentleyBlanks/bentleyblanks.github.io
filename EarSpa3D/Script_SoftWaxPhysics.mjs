// 有厚度的 XPBD 薄壳：物理节点驱动原网格，附着点不参与额外几何绘制。
const Add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const Sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const Mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const Dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const Length=a=>Math.hypot(...a),Unit=a=>Mul(a,1/(Length(a)||1));
const Clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function Rotate(q,v){const t=Mul(Cross(q,v),2);return Add(v,Add(Mul(t,q[3]),Cross(q,t)));}
const Inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const World=(body,p)=>Add(body.position,Rotate(body.rotation,p));
const Local=(body,p)=>Rotate(Inverse(body.rotation),Sub(p,body.position));
function Product(a,b){const xyz=Add(Add(Mul(b,a[3]),Mul(a,b[3])),Cross(a,b));return[...xyz,a[3]*b[3]-Dot(a,b)];}
const PROFILES={dry:{stretch:2e-7,bend:.12,strength:32,cohesion:70000},wet:{stretch:1.2e-5,bend:.45,strength:32,cohesion:7500},impacted:{stretch:4e-8,bend:.00001,strength:45,cohesion:3800}};

function Barycentric(p,a,b,c){
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(den)<1e-12)return null;
  const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/den;
  const v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/den;
  return[u,v,1-u-v];
}
function Frame(points,ids){const a=points[ids[0]],x=Unit(Sub(points[ids[1]],a)),z=Unit(Cross(x,Sub(points[ids[2]],a)));return[x,Cross(z,x),z];}
function Weighted(points,ids,weights){const p=[0,0,0];for(let j=0;j<3;j++)for(let k=0;k<3;k++)p[k]+=points[ids[j]][k]*weights[j];return p;}
function BindPoint(surface,p){
  let best=null,distance=Infinity;
  for(let i=0;i<surface.triangles.length;i++){
    const ids=surface.triangles[i],bary=Barycentric(p,...ids.map(j=>surface.rest[j]));if(!bary)continue;
    // 最近边插值仅供少数位于简化轮廓外的原网格顶点；切口和厚度保留在局部框架里。
    const weights=bary.map(v=>Math.max(0,v)),sum=weights.reduce((s,v)=>s+v,0);for(let j=0;j<3;j++)weights[j]/=sum;
    const point=Weighted(surface.rest,ids,weights),d=(point[0]-p[0])**2+(point[1]-p[1])**2;
    if(d<distance){const delta=Sub(p,point);distance=d;best={triangle:i,ids,weights,offset:Frame(surface.rest,ids).map(axis=>Dot(delta,axis))};}
    if(d<1e-15)break;
  }
  return best;
}
function BoundPoint(surface,binding){const p=Weighted(surface.points,binding.ids,binding.weights),frame=Frame(surface.points,binding.ids);for(let j=0;j<3;j++)for(let k=0;k<3;k++)p[k]+=frame[j][k]*binding.offset[j];return p;}

export function BindWaxSurface(body,positions,indices){
  for(const _ of BindWaxSurfaceSteps(body,positions,indices)){/* synchronous fracture and diagnostic entry */}
  return body;
}

// 暂存客人可在确定性的绑定步骤之间让出主线程，求解网格与权重不变。
export function* BindWaxSurfaceSteps(body,positions,indices){
  const vertices=Array.from({length:positions.length/3},(_,i)=>Array.from(positions.slice(i*3,i*3+3)));
  const faces=Array.from({length:indices.length/3},(_,i)=>[indices[i*3],indices[i*3+1],indices[i*3+2]]);
  const min=[0,1].map(k=>Math.min(...vertices.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...vertices.map(p=>p[k]))),center=min.map((v,k)=>(v+max[k])/2);
  const rest=[],thickness=[],segments=16,rings=4,triangles=[];
  function Sample(x,y){
    let bottom=Infinity,top=-Infinity;
    for(const ids of faces){const b=Barycentric([x,y],...ids.map(i=>vertices[i]));if(b&&b.every(v=>v>=-1e-5)){const z=b.reduce((s,v,i)=>s+v*vertices[ids[i]][2],0);bottom=Math.min(bottom,z);top=Math.max(top,z);}}
    if(!Number.isFinite(bottom)){const nearest=vertices.reduce((a,b)=>(b[0]-x)**2+(b[1]-y)**2<(a[0]-x)**2+(a[1]-y)**2?b:a);bottom=top=nearest[2];}
    rest.push([x,y,(bottom+top)/2]);thickness.push(Math.max(.006,(top-bottom)/2));
  }
  Sample(...center);yield;
  const radii=[];for(let j=0;j<segments;j++){
    const direction=[Math.cos(j*Math.PI*2/segments),Math.sin(j*Math.PI*2/segments)];let radius=0;
    for(const ids of faces)for(let e=0;e<3;e++){
      const a=vertices[ids[e]],b=vertices[ids[(e+1)%3]],dx=b[0]-a[0],dy=b[1]-a[1],den=direction[0]*dy-direction[1]*dx;
      if(Math.abs(den)<1e-10)continue;
      const ax=a[0]-center[0],ay=a[1]-center[1],r=(ax*dy-ay*dx)/den,t=(ax*direction[1]-ay*direction[0])/den;
      if(t>=-1e-7&&t<=1+1e-7)radius=Math.max(radius,r);
    }
    radii.push(Math.max(.01,radius*.998));yield;
  }
  for(let r=1;r<=rings;r++)for(let j=0;j<segments;j++){const a=j*Math.PI*2/segments;Sample(center[0]+Math.cos(a)*radii[j]*r/rings,center[1]+Math.sin(a)*radii[j]*r/rings);yield;}
  const Index=(r,j)=>1+(r-1)*segments+(j+segments)%segments;
  for(let j=0;j<segments;j++)triangles.push([0,Index(1,j),Index(1,j+1)]);
  for(let r=1;r<rings;r++)for(let j=0;j<segments;j++){const a=Index(r,j),b=Index(r+1,j),c=Index(r+1,j+1),d=Index(r,j+1);triangles.push([a,b,c],[a,c,d]);}
  const edges=new Map(),bends=[];
  for(const ids of triangles)for(let e=0;e<3;e++){
    const a=ids[e],b=ids[(e+1)%3],opposite=ids[(e+2)%3],key=[a,b].sort((x,y)=>x-y).join(':');
    if(edges.has(key)){const edge=edges.get(key),bend={ids:[edge.a,edge.b,edge.opposite,opposite],lambda:0};bend.rest=Dihedral(rest,bend.ids).angle;bends.push(bend);}
    else edges.set(key,{a,b,opposite,rest:Length(Sub(rest[a],rest[b])),lambda:0});
  }
  const surface={rest,points:rest.map(p=>World(body,p)),velocities:rest.map(()=>[0,0,0]),triangles,edges:[...edges.values()],bends,thickness,grip:null,motion:0,peakBend:0,maxStretch:0,releaseClock:0};
  surface.bindings=[];
  for(let i=0;i<vertices.length;i++){surface.bindings.push(BindPoint(surface,vertices[i]));if(i%32===31)yield;}
  const used=new Set();
  for(const anchor of body.anchors){
    if(anchor.inherited){anchor.binding=BindPoint(surface,anchor.local);anchor.lambda=[0,0,0];continue;}
    let node=-1,distance=Infinity;for(let i=1;i<rest.length;i++){const d=(rest[i][0]-anchor.local[0])**2+(rest[i][1]-anchor.local[1])**2;if(!used.has(i)&&d<distance){node=i;distance=d;}}
    used.add(node);anchor.node=node;anchor.local=rest[node].slice();anchor.rest=surface.points[node].slice();anchor.lambda=[0,0,0];
  }
  surface.restFit=FitRotation({points:rest});surface.support=surface.points.map(p=>p.slice());body.surface=surface;body.bend=0;body.motion=0;
  surface.sections=bends.map(edge=>{
    const [a,b]=edge.ids,mid=Mul(Add(rest[a],rest[b]),.5),axis=Unit(Sub(rest[b],rest[a])),normal=Unit(Cross(axis,Frame(rest,edge.ids.slice(0,3))[2]));
    const distances=rest.map(p=>Dot(Sub(p,mid),normal)),span=rest.map(p=>Dot(Sub(p,mid),axis));
    return{edge,mid,normal,positive:distances.filter(d=>d>.005).length,width:Math.max(.08,Math.max(...span)-Math.min(...span)),sides:body.anchors.map(a=>Dot(Sub(a.local,mid),normal))};
  });
  surface.sectionThickness=Math.max(.035,thickness.reduce((sum,t)=>sum+t*2,0)/thickness.length);
  return body;
}

export function GripWaxSurface(body,point){
  const s=body.surface;
  // 重夹时在当前形变表面反查原始三角片，不能把弯起的坐标当成新的静止形状。
  let best=null,distance=Infinity;
  for(let i=0;i<s.triangles.length;i++){
    const ids=s.triangles[i],a=s.points[ids[0]],v0=Sub(s.points[ids[1]],a),v1=Sub(s.points[ids[2]],a),v2=Sub(point,a),d00=Dot(v0,v0),d01=Dot(v0,v1),d11=Dot(v1,v1),den=d00*d11-d01*d01;
    if(den<1e-12)continue;
    const v=(d11*Dot(v2,v0)-d01*Dot(v2,v1))/den,w=(d00*Dot(v2,v1)-d01*Dot(v2,v0))/den,weights=[1-v-w,v,w].map(v=>Math.max(0,v)),sum=weights.reduce((a,b)=>a+b,0);for(let j=0;j<3;j++)weights[j]/=sum;
    const p=Weighted(s.points,ids,weights),delta=Sub(point,p),d=Length(delta);if(d<distance){distance=d;best={triangle:i,ids,weights,offset:Frame(s.points,ids).map(axis=>Dot(delta,axis))};}
  }
  s.grip={...best,lambda:[0,0,0]};
  body.grip=Local(body,point);
}
export function UngripWaxSurface(body){body.surface.grip=null;}
export function WaxAnchorPoint(body,anchor){return anchor.binding?BoundPoint(body.surface,anchor.binding):body.surface.points[anchor.node];}

// 壳的拉伸/剪切使用三角边，弯曲单独约束两三角形之间的有符号二面角。
// 柔度除以子步时间平方，迭代次数不再直接决定材料软硬。
function DistanceConstraint(s,c,alpha,inverseMass){
  const a=s.points[c.a],b=s.points[c.b],d=Sub(a,b),length=Length(d);if(length<1e-10)return;
  const lambda=(-(length-c.rest)-alpha*c.lambda)/(2*inverseMass+alpha);c.lambda+=lambda;
  for(let k=0;k<3;k++){const correction=d[k]/length*lambda*inverseMass;a[k]+=correction;b[k]-=correction;}
}
function Dihedral(points,ids){
  const [a,b,c,d]=ids.map(i=>points[i]),edge=Sub(b,a),length=Length(edge),n0=Cross(edge,Sub(c,a)),n1=Cross(Sub(d,a),edge),sq0=Dot(n0,n0),sq1=Dot(n1,n1);
  if(length<1e-8||sq0<1e-14||sq1<1e-14)return{angle:0,gradients:null};
  const q2=Mul(n0,-length/sq0),q3=Mul(n1,-length/sq1),q0=Add(Mul(q2,Dot(Sub(c,b),edge)/(length*length)),Mul(q3,Dot(Sub(d,b),edge)/(length*length))),q1=Mul(Add(Add(q0,q2),q3),-1);
  return{angle:Math.atan2(Dot(Cross(Unit(n0),Unit(n1)),Mul(edge,1/length)),Dot(Unit(n0),Unit(n1))),gradients:[q0,q1,q2,q3]};
}
function BendConstraint(s,c,alpha,inverseMass){
  const {angle,gradients}=Dihedral(s.points,c.ids);if(!gradients)return;
  let error=angle-c.rest;if(error>Math.PI)error-=2*Math.PI;if(error<-Math.PI)error+=2*Math.PI;
  const weight=gradients.reduce((sum,q)=>sum+Dot(q,q)*inverseMass,0),lambda=(-error-alpha*c.lambda)/(weight+alpha);c.lambda+=lambda;
  for(let j=0;j<4;j++)for(let k=0;k<3;k++)s.points[c.ids[j]][k]+=gradients[j][k]*lambda*inverseMass;
}
function Pin(s,ids,weights,target,lambda,alpha,inverseMass,offset=null,maxLambda=Infinity){
  const p=Weighted(s.points,ids,weights),mass=weights.reduce((sum,w)=>sum+w*w,0)*inverseMass;
  const next=lambda.map((v,k)=>v+(-(p[k]+(offset?.[k]||0)-target[k])-alpha*v)/(mass+alpha)),length=Length(next);
  if(length>maxLambda)for(let k=0;k<3;k++)next[k]*=maxLambda/length;
  for(let k=0;k<3;k++){
    const dl=next[k]-lambda[k];lambda[k]=next[k];
    for(let j=0;j<ids.length;j++)s.points[ids[j]][k]+=dl*weights[j]*inverseMass;
  }
}
function FitRotation(s){
  const x=Unit(Sub(s.points[49],s.points[57])),rawY=Sub(s.points[53],s.points[61]),z=Unit(Cross(x,rawY)),y=Cross(z,x);
  const trace=x[0]+y[1]+z[2];let q;
  if(trace>0){const t=Math.sqrt(trace+1)*2;q=[(y[2]-z[1])/t,(z[0]-x[2])/t,(x[1]-y[0])/t,t/4];}
  else if(x[0]>y[1]&&x[0]>z[2]){const t=Math.sqrt(1+x[0]-y[1]-z[2])*2;q=[t/4,(y[0]+x[1])/t,(z[0]+x[2])/t,(y[2]-z[1])/t];}
  else if(y[1]>z[2]){const t=Math.sqrt(1+y[1]-x[0]-z[2])*2;q=[(y[0]+x[1])/t,t/4,(z[1]+y[2])/t,(z[0]-x[2])/t];}
  else{const t=Math.sqrt(1+z[2]-x[0]-y[1])*2;q=[(z[0]+x[2])/t,(z[1]+y[2])/t,t/4,(x[1]-y[0])/t];}
  return q.map(v=>v/(Math.hypot(...q)||1));
}

// 对穿过网格边的截面积分真实锚点反力和弯矩。裂纹位置由载荷路径决定，
// 不从块中心随机切，也不累计按住时间。单位为 mm 与求解器的归一化力单位。
function CohesiveSection(body,h,profile,soft){
  const s=body.surface,binding=s.grip,grip=Weighted(s.rest,binding.ids,binding.weights),frame=Frame(s.rest,binding.ids);
  for(let j=0;j<3;j++)for(let k=0;k<3;k++)grip[k]+=frame[j][k]*binding.offset[j];
  if(!body.anchors.some(a=>a.alive))return;
  const anchorPoints=body.anchors.map(a=>WaxAnchorPoint(body,a)),reactions=body.anchors.map(a=>Mul(a.lambda,-1/(h*h)));
  let critical=null;
  for(const section of s.sections){
    const {edge,width}=section,sign=Dot(Sub(grip,section.mid),section.normal)<0?-1:1;
    const gripDistance=Math.abs(Dot(Sub(grip,section.mid),section.normal));
    if(gripDistance<Math.max(.045,body.size*.12))continue;
    if(section.positive<s.points.length*.12||section.positive>s.points.length*.85)continue;
    const [ia,ib]=edge.ids,mid=Mul(Add(s.points[ia],s.points[ib]),.5),axis=Unit(Sub(s.points[ib],s.points[ia]));
    const face=Frame(s.points,edge.ids.slice(0,3))[2],normal=Mul(Unit(Cross(axis,face)),sign);
    let force=[0,0,0],moment=[0,0,0],fixed=0;
    for(let j=0;j<body.anchors.length;j++)if(body.anchors[j].alive&&section.sides[j]*sign<-.008){fixed++;force=Add(force,reactions[j]);moment=Add(moment,Cross(Sub(anchorPoints[j],mid),reactions[j]));}
    if(!fixed)continue;
    const thickness=s.sectionThickness;
    const tensile=Math.max(0,Dot(force,normal)),shear=Math.abs(Dot(force,face));
    const stress=(tensile+shear*.25)/(width*thickness)+6*Math.abs(Dot(moment,axis))/(width*thickness*thickness);
    const ratio=stress/(profile.cohesion*(1+soft*5));
    edge.peakLoad=Math.max(edge.peakLoad||0,ratio);
    edge.damage=Clamp((edge.peakLoad-.65)/.7);
    if(!critical||ratio>critical.ratio)critical={ratio,damage:edge.damage,point:mid,normal,stress,width,thickness};
  }
  s.cohesion=critical;
  if(critical?.damage>=1&&!s.fracture)s.fracture=critical;
}

export function StepWaxSurface(body,{target=null,softness=0,efficiency=1,adhesion=1,minAnchors=0,supportRotation=null,fracture=false}={},dt=1/60){
  const s=body.surface,profile=PROFILES[body.type]||PROFILES.dry,soft=Clamp(softness),duration=Clamp(dt,0,.05),count=Math.max(1,Math.ceil(duration*240)),h=duration/count;
  if(h===0)return{detached:body.detached,remaining:body.anchors.filter(a=>a.alive).length,strain:Clamp(body.strain),force:body.force,contact:body.contact};
  const mass=s.points.length,stretch=profile.stretch*(1+soft*10)/(h*h),bend=(profile.bend+soft*.20)/(h*h);
  body.softness=soft;body.contact=false;body.strain=0;let simulatedTime=0;
  for(let step=0;step<count;step++){
    const before=s.points.map(p=>p.slice()),damping=Math.exp(-h*12);
    for(let i=0;i<s.points.length;i++)for(let k=0;k<3;k++)s.points[i][k]+=s.velocities[i][k]*h*damping;
    for(const c of [...s.edges,...s.bends])c.lambda=0;
    for(const a of body.anchors)a.lambda=[0,0,0];if(s.grip)s.grip.lambda=[0,0,0];
    for(let iteration=0;iteration<8;iteration++){
      for(const c of s.edges)DistanceConstraint(s,c,stretch,mass);
      for(const c of s.bends)BendConstraint(s,c,bend,mass);
      for(const a of body.anchors)if(a.alive){
        const binding=a.binding,offset=binding?Sub(BoundPoint(s,binding),Weighted(s.points,binding.ids,binding.weights)):null;
        Pin(s,binding?.ids||[a.node,a.node,a.node],binding?.weights||[1,0,0],a.rest,a.lambda,.000004*(1+(a.damage||0)*3)/Math.max(.03,adhesion)/(h*h),mass,offset);
      }
      if(s.grip&&target){const frame=Frame(s.points,s.grip.ids),offset=[0,0,0];for(let j=0;j<3;j++)for(let k=0;k<3;k++)offset[k]+=frame[j][k]*s.grip.offset[j];Pin(s,s.grip.ids,s.grip.weights,target,s.grip.lambda,1/(220*Math.max(.03,efficiency)*h*h),mass,offset,135*h*h);}
      // 每个材料点有独立背面支撑，向耳壁内推不会换来剥离进度。
      if(!body.detached)for(let i=0;i<s.points.length;i++){const opening=Dot(Sub(s.points[i],s.support[i]),body.normal);if(opening<0){for(let k=0;k<3;k++)s.points[i][k]-=body.normal[k]*opening;body.contact||=opening<-.0001;}}
    }
    let candidate=null,maxStrain=0;
    for(const a of body.anchors)if(a.alive){
      const reaction=Mul(a.lambda,-1/(h*h)),normal=Dot(reaction,body.normal),slide=Length(Sub(reaction,Mul(body.normal,normal)));
      a.strain=(Math.max(0,normal)+slide*.22)/(profile.strength*(1-soft*(body.type==='impacted'?.85:.55))*Math.sqrt(Math.max(.001,adhesion)));
      a.peakLoad=Math.max(a.peakLoad||0,a.strain);a.damage=Clamp((a.peakLoad-.7)/.3);
      if(a.strain>maxStrain){maxStrain=a.strain;candidate=a;}
    }
    if(fracture&&target&&s.grip&&!s.fracture)CohesiveSection(body,h,profile,soft);
    s.releaseClock=Math.max(0,s.releaseClock-h);
    if(target&&s.grip&&candidate&&maxStrain>1&&s.releaseClock===0&&body.anchors.filter(a=>a.alive).length>minAnchors){candidate.alive=false;s.releaseClock=.018;}
    body.strain=Math.max(body.strain,maxStrain);body.force=s.grip&&target?Math.min(135,Length(s.grip.lambda)/(h*h)):0;
    body.detached=body.anchors.every(a=>!a.alive);
    if(body.detached&&s.grip&&supportRotation){
      const pose=Product(FitRotation(s),Inverse(s.restFit)),delta=Product(supportRotation,Inverse(pose)),sign=delta[3]<0?-1:1,t=1-Math.exp(-h*8),q=delta.map((v,k)=>v*sign*t+(k===3?1-t:0)),length=Math.hypot(...q),pivot=BoundPoint(s,s.grip);
      for(let k=0;k<4;k++)q[k]/=length;
      for(let i=0;i<s.points.length;i++)s.points[i]=Add(pivot,Rotate(q,Sub(s.points[i],pivot)));
    }
    s.motion=0;
    for(let i=0;i<s.points.length;i++){s.velocities[i]=Mul(Sub(s.points[i],before[i]),1/h);const speed=Length(s.velocities[i]);if(speed>24)s.velocities[i]=Mul(s.velocities[i],24/speed);s.motion=Math.max(s.motion,speed);}
    body.steps++;
    simulatedTime+=h;
    if(s.fracture)break;
  }
  const previous=body.position,rotation=Product(FitRotation(s),Inverse(s.restFit)),rotationDelta=Product(rotation,Inverse(body.rotation)),restCenter=s.rest.reduce((p,v)=>Add(p,Mul(v,1/s.rest.length)),[0,0,0]),center=s.points.reduce((p,v)=>Add(p,Mul(v,1/s.points.length)),[0,0,0]);
  body.rotation=rotation;body.position=Sub(center,Rotate(rotation,restCenter));body.velocity=Mul(Sub(body.position,previous),1/simulatedTime);body.spin=Mul(rotationDelta,(rotationDelta[3]<0?-2:2)/simulatedTime);body.motion=s.motion;
  if(s.grip)body.grip=Local(body,BoundPoint(s,s.grip));
  s.maxStretch=Math.max(...s.edges.map(c=>Math.abs(Length(Sub(s.points[c.a],s.points[c.b]))/c.rest-1)));
  const restFrames=s.triangles.map(ids=>Frame(s.rest,ids)[2]),frames=s.triangles.map(ids=>Frame(s.points,ids)[2]);
  body.bend=Math.max(...frames.map((n,i)=>Math.acos(Clamp(Dot(n,Rotate(rotation,restFrames[i])),-1,1))));s.peakBend=Math.max(s.peakBend,body.bend);
  return{detached:body.detached,remaining:body.anchors.filter(a=>a.alive).length,strain:Clamp(body.strain),force:body.force,contact:body.contact,fracture:s.fracture||null};
}

export function WriteWaxSurface(body,positions){
  const s=body.surface,frames=s.triangles.map(ids=>Frame(s.points,ids)),inverse=Inverse(body.rotation);
  for(let i=0;i<s.bindings.length;i++){
    const b=s.bindings[i],p=Weighted(s.points,b.ids,b.weights),frame=frames[b.triangle];
    for(let j=0;j<3;j++)for(let k=0;k<3;k++)p[k]+=frame[j][k]*b.offset[j];
    const local=Rotate(inverse,Sub(p,body.position));for(let k=0;k<3;k++)positions[i*3+k]=local[k];
  }
}
