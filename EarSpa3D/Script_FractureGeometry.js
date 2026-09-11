import * as THREE from 'three';
// 相邻三角面的切线组成独立边界环；凹轮廓用耳切三角化，不能跨环做中心扇形封口。
export function CutGeometry(source,normal,constant,positive=true){
 const geometry=source.index?source.toNonIndexed():source.clone(),pos=geometry.attributes.position,uv=geometry.attributes.uv,oldCap=geometry.attributes.waxCap;
 const positions=[],uvs=[],caps=[],segments=[],sign=positive?1:-1,eps=1e-7;
 const Vert=i=>({p:new THREE.Vector3().fromBufferAttribute(pos,i),u:uv?new THREE.Vector2().fromBufferAttribute(uv,i):new THREE.Vector2(),cap:oldCap?.getX(i)||0});
 const Distance=v=>(normal.dot(v.p)-constant)*sign;
 const Key=v=>v.p.toArray().map(x=>Math.round(x*1e6)).join(',');
 function Emit(a,b,c,cap=null){if(new THREE.Vector3().subVectors(b.p,a.p).cross(new THREE.Vector3().subVectors(c.p,a.p)).lengthSq()<1e-20)return;for(const v of [a,b,c]){positions.push(...v.p.toArray());uvs.push(...v.u.toArray());caps.push(cap??v.cap);}}
 for(let i=0;i<pos.count;i+=3){
   const polygon=[Vert(i),Vert(i+1),Vert(i+2)],out=[],crossings=[];
   for(let j=0;j<3;j++){
     const a=polygon[j],b=polygon[(j+1)%3],da=Distance(a),db=Distance(b);
     if(da>=-eps)out.push(a);
     if(Math.abs(da)<eps)crossings.push(a);
     if((da>eps&&db<-eps)||(da<-eps&&db>eps)){const t=da/(da-db),v={p:a.p.clone().lerp(b.p,t),u:a.u.clone().lerp(b.u,t),cap:a.cap};out.push(v);crossings.push(v);}
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
 geometry.dispose();const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));result.setAttribute('waxCap',new THREE.Float32BufferAttribute(caps,1));result.setIndex(Array.from({length:positions.length/3},(_,i)=>i));SmoothWaxNormals(result);result.computeBoundingBox();return result;
}
// 保持外壳跨 UV 接缝平滑，裂面保留真实法线，避免每个三角形变成一张纸楔。
export function SmoothWaxNormals(g){
 g.computeVertexNormals();const p=g.attributes.position,n=g.attributes.normal,cap=g.attributes.waxCap,idx=g.index,groups=new Map(),keys=[];
 for(let i=0;i<p.count;i++){if(cap?.getX(i)>.5){keys.push(null);continue;}const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');keys.push(key);if(!groups.has(key))groups.set(key,new THREE.Vector3());}
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<(idx?idx.count:p.count);i+=3){const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j);a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]).sub(a);c.fromBufferAttribute(p,ids[2]).sub(a);b.cross(c);for(const k of ids)if(keys[k])groups.get(keys[k]).add(b);}
 for(const v of groups.values())v.normalize();for(let i=0;i<p.count;i++)if(keys[i]){const v=groups.get(keys[i]);n.setXYZ(i,v.x,v.y,v.z);}n.needsUpdate=true;
}
// Volume is measured from the actual sealed faces, so daughter mass follows the cut.
export function GeometryVolume(g){const p=g.attributes.position,idx=g.index;let sum=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();for(let i=0;i<(idx?idx.count:p.count);i+=3){a.fromBufferAttribute(p,idx?idx.getX(i):i);b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1);c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2);sum+=a.dot(b.cross(c))/6;}return Math.abs(sum);}
export function FractureGeometry(source,{direction=[1,0,0],grip=[0,0,0],seed=1,generation=0,load=1}={}){
 const pull=new THREE.Vector3().fromArray(direction);pull.z*=.18;if(pull.length()<.001)pull.set(1,0,0);pull.normalize();
 const count=2+Math.floor((Math.sin(seed*31.7)+1)*.999)+(generation===0&&load>.85?1:0);
 let pieces=[source.clone()];
 for(let cut=0;cut<count-1;cut++){
   const weights=pieces.map(GeometryVolume),index=weights.indexOf(Math.max(...weights)),part=pieces[index];part.computeBoundingBox();
   const center=part.boundingBox.getCenter(new THREE.Vector3()),extent=part.boundingBox.getSize(new THREE.Vector3());
   const n=pull.clone().applyAxisAngle(new THREE.Vector3(0,0,1),Math.sin(seed+cut*2.6)*.21);
   const width=Math.abs(n.x)*extent.x+Math.abs(n.y)*extent.y+Math.abs(n.z)*extent.z;
   const offset=THREE.MathUtils.clamp(new THREE.Vector3().fromArray(grip).sub(center).dot(n)*.17,-width*.12,width*.12)+Math.sin(seed*1.7+cut)*width*.10;
   const plane=center.dot(n)+offset,a=CutGeometry(part,n,plane,false),b=CutGeometry(part,n,plane,true);
   if(a.attributes.position.count<15||b.attributes.position.count<15||GeometryVolume(a)<weights[index]*.04||GeometryVolume(b)<weights[index]*.04){a.dispose();b.dispose();continue;}
   a.userData.cutNormal=n.toArray();b.userData.cutNormal=n.toArray();part.dispose();pieces.splice(index,1,a,b);
 }
 return pieces;
}
