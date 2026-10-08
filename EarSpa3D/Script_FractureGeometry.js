import * as THREE from 'three';
// 相邻三角面的切线组成独立边界环；凹轮廓用耳切三角化，不能跨环做中心扇形封口。
export function CutGeometry(source,normal,constant,positive=true){
 const geometry=source.index?source.toNonIndexed():source.clone(),pos=geometry.attributes.position,uv=geometry.attributes.uv,oldCap=geometry.attributes.waxCap;
 const positions=[],uvs=[],caps=[],rest=[],response=[],segments=[],sign=positive?1:-1,eps=1e-7;
 const Vert=i=>({p:new THREE.Vector3().fromBufferAttribute(pos,i),u:uv?new THREE.Vector2().fromBufferAttribute(uv,i):new THREE.Vector2(),cap:oldCap?.getX(i)||0,r:new THREE.Vector3().fromBufferAttribute(geometry.attributes.waxRest||pos,i),s:geometry.attributes.waxResponse?new THREE.Vector3().fromBufferAttribute(geometry.attributes.waxResponse,i):new THREE.Vector3(.035,0,0)});
 const Distance=v=>(normal.dot(v.p)-constant)*sign;
 const Key=v=>v.p.toArray().map(x=>Math.round(x*1e6)).join(',');
 function Emit(a,b,c,cap=null){if(new THREE.Vector3().subVectors(b.p,a.p).cross(new THREE.Vector3().subVectors(c.p,a.p)).lengthSq()<1e-20)return;for(const v of [a,b,c]){positions.push(...v.p.toArray());uvs.push(...v.u.toArray());caps.push(cap??v.cap);rest.push(...v.r.toArray());response.push(...v.s.toArray());}}
 for(let i=0;i<pos.count;i+=3){
   const polygon=[Vert(i),Vert(i+1),Vert(i+2)],out=[],crossings=[];
   for(let j=0;j<3;j++){
     const a=polygon[j],b=polygon[(j+1)%3],da=Distance(a),db=Distance(b);
     if(da>=-eps)out.push(a);
     if(Math.abs(da)<eps)crossings.push(a);
     if((da>eps&&db<-eps)||(da<-eps&&db>eps)){const t=da/(da-db),v={p:a.p.clone().lerp(b.p,t),u:a.u.clone().lerp(b.u,t),r:a.r.clone().lerp(b.r,t),s:a.s.clone().lerp(b.s,t),cap:a.cap};out.push(v);crossings.push(v);}
   }
   for(let j=1;j<out.length-1;j++)Emit(out[0],out[j],out[j+1]);
   const cut=[...new Map(crossings.map(v=>[Key(v),v])).values()];
   if(cut.length===2&&polygon.some(v=>Distance(v)>eps)&&polygon.some(v=>Distance(v)<-eps))segments.push(cut);
 }
 const nodes=new Map(),edges=new Set();
 for(const [a,b] of segments){const ka=Key(a),kb=Key(b),edge=[ka,kb].sort().join('|');if(ka===kb||edges.has(edge))continue;edges.add(edge);for(const [key,v,next] of [[ka,a,kb],[kb,b,ka]]){if(!nodes.has(key))nodes.set(key,{v,links:[]});nodes.get(key).links.push(next);}}
 const axis=new THREE.Vector3(Math.abs(normal.x)>.8?0:1,Math.abs(normal.x)>.8?1:0,0).cross(normal).normalize(),other=normal.clone().cross(axis);
 while(edges.size){
   const first=edges.values().next().value,[start,next]=first.split('|'),loop=[nodes.get(start).v];edges.delete(first);let prev=start,current=next,closed=false;
   for(let guard=0;guard<=segments.length+1;guard++){
     if(current===start){closed=true;break;}loop.push(nodes.get(current).v);
     const candidate=nodes.get(current).links.find(k=>k!==prev&&edges.has([current,k].sort().join('|')));
     if(!candidate)break;edges.delete([current,candidate].sort().join('|'));prev=current;current=candidate;
   }
   if(!closed||loop.length<3)continue;
   const contour=loop.map(v=>new THREE.Vector2(v.p.dot(axis),v.p.dot(other)));
   for(const ids of THREE.ShapeUtils.triangulateShape(contour,[])){
     let [a,b,c]=ids.map(i=>loop[i]);const facing=new THREE.Vector3().subVectors(b.p,a.p).cross(new THREE.Vector3().subVectors(c.p,a.p)).dot(normal);
     if((facing>0)===positive)[b,c]=[c,b];Emit(a,b,c,1);
   }
 }
 geometry.dispose();const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));result.setAttribute('waxCap',new THREE.Float32BufferAttribute(caps,1));result.setAttribute('waxRest',new THREE.Float32BufferAttribute(rest,3));result.setAttribute('waxResponse',new THREE.Float32BufferAttribute(response,3));result.setIndex(Array.from({length:positions.length/3},(_,i)=>i));SmoothWaxNormals(result);result.computeBoundingBox();return result;
}
// 保持外壳跨 UV 接缝平滑，裂面保留真实法线，避免每个三角形变成一张纸楔。
const normalBindings=new WeakMap();
export function SmoothWaxNormals(g){
 const p=g.attributes.position,cap=g.attributes.waxCap,idx=g.index;
 let cache=normalBindings.get(g);
 if(!cache||cache.position!==p||cache.index!==idx||cache.cap!==cap||cache.indexVersion!==idx?.version||cache.capVersion!==cap?.version){
   const rest=p,groups=new Map(),binding=new Uint32Array(p.count);let count=0;
   for(let i=0;i<p.count;i++){
     // Capture welds when the topology is created, including newly cut edges.
     // Keep them through bending; caps retain independent face normals.
     const key=cap?.getX(i)>.5?'cap'+i:[rest.getX(i),rest.getY(i),rest.getZ(i)].map(x=>Math.round(x*1e5)).join(',');
     if(!groups.has(key))groups.set(key,count++);binding[i]=groups.get(key)*3;
   }
   cache={position:p,index:idx,cap,indexVersion:idx?.version,capVersion:cap?.version,binding,sums:new Float64Array(count*3)};normalBindings.set(g,cache);
 }
 if(!g.attributes.normal||g.attributes.normal.count!==p.count)g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(p.count*3),3));
 const n=g.attributes.normal,{binding,sums}=cache,positions=p.array,indices=idx?.array;sums.fill(0);
 for(let i=0;i<(indices?indices.length:p.count);i+=3){
   const a=indices?indices[i]:i,b=indices?indices[i+1]:i+1,c=indices?indices[i+2]:i+2;
   const ai=a*3,bi=b*3,ci=c*3;
   const bx=positions[bi]-positions[ai],by=positions[bi+1]-positions[ai+1],bz=positions[bi+2]-positions[ai+2];
   const cx=positions[ci]-positions[ai],cy=positions[ci+1]-positions[ai+1],cz=positions[ci+2]-positions[ai+2];
   const x=by*cz-bz*cy,y=bz*cx-bx*cz,z=bx*cy-by*cx;
   const ia=binding[a],ib=binding[b],ic=binding[c];
   sums[ia]+=x;sums[ia+1]+=y;sums[ia+2]+=z;
   sums[ib]+=x;sums[ib+1]+=y;sums[ib+2]+=z;
   sums[ic]+=x;sums[ic+1]+=y;sums[ic+2]+=z;
 }
 for(let i=0;i<sums.length;i+=3){const length=Math.hypot(sums[i],sums[i+1],sums[i+2])||1;sums[i]/=length;sums[i+1]/=length;sums[i+2]/=length;}
 for(let i=0;i<p.count;i++){const offset=binding[i];n.setXYZ(i,sums[offset],sums[offset+1],sums[offset+2]);}n.needsUpdate=true;
}
// Volume is measured from the actual sealed faces, so daughter mass follows the cut.
export function GeometryVolume(g){const p=g.attributes.position,idx=g.index;let sum=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();for(let i=0;i<(idx?idx.count:p.count);i+=3){a.fromBufferAttribute(p,idx?idx.getX(i):i);b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1);c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2);sum+=a.dot(b.cross(c))/6;}return Math.abs(sum);}
// 只接受物理解算得到的截面。两侧共用同一平面并封口，不能用随机种子决定碎片。
export function FractureGeometry(source,{normal,point}={}){
 if(!normal||!point)return [];
 const axis=new THREE.Vector3().fromArray(normal).normalize(),constant=axis.dot(new THREE.Vector3().fromArray(point));
 if(axis.lengthSq()<.99)return [];
 const pieces=[CutGeometry(source,axis,constant,false),CutGeometry(source,axis,constant,true)],volumes=pieces.map(GeometryVolume),total=volumes[0]+volumes[1];
 if(total<=1e-12||volumes.some(v=>v<total*.025)||pieces.some(g=>g.attributes.position.count<12)){pieces.forEach(g=>g.dispose());return [];}
 for(const piece of pieces){piece.userData.cutNormal=axis.toArray();piece.userData.cutPoint=point.slice();}
 return pieces;
}
