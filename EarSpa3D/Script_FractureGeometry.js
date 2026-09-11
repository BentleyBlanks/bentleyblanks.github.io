import * as THREE from 'three';
// 真正切开三角面并封住截面；每个碎片拥有独立网格，不用缩小整块伪装碎裂。
export function CutGeometry(source,normal,constant,positive=true){
 const geometry=source.index?source.toNonIndexed():source.clone(),pos=geometry.attributes.position,uv=geometry.attributes.uv;
 const positions=[],uvs=[],cuts=[];const sign=positive?1:-1;
 const Vert=i=>({p:new THREE.Vector3().fromBufferAttribute(pos,i),u:uv?new THREE.Vector2().fromBufferAttribute(uv,i):new THREE.Vector2()});
 const Distance=v=>(normal.dot(v.p)-constant)*sign;
 function Emit(a,b,c){for(const v of [a,b,c]){positions.push(...v.p.toArray());uvs.push(...v.u.toArray());}}
 for(let i=0;i<pos.count;i+=3){
   let polygon=[Vert(i),Vert(i+1),Vert(i+2)],out=[];
   for(let j=0;j<3;j++){
     const a=polygon[j],b=polygon[(j+1)%3],da=Distance(a),db=Distance(b);
     if(da>=0)out.push(a);
     if((da>=0)!==(db>=0)){const t=da/(da-db);const v={p:a.p.clone().lerp(b.p,t),u:a.u.clone().lerp(b.u,t)};out.push(v);cuts.push(v);}
   }
   for(let j=1;j<out.length-1;j++)Emit(out[0],out[j],out[j+1]);
 }
 const unique=[...new Map(cuts.map(v=>[v.p.toArray().map(x=>x.toFixed(5)).join(','),v])).values()];
 if(unique.length>2){
   const center={p:new THREE.Vector3(),u:new THREE.Vector2()};for(const v of unique){center.p.add(v.p);center.u.add(v.u);}center.p.divideScalar(unique.length);center.u.divideScalar(unique.length);
   const axis=new THREE.Vector3(1,0,0);if(Math.abs(axis.dot(normal))>.8)axis.set(0,1,0);axis.cross(normal).normalize();const other=normal.clone().cross(axis);
   unique.sort((a,b)=>Math.atan2(a.p.clone().sub(center.p).dot(other),a.p.clone().sub(center.p).dot(axis))-Math.atan2(b.p.clone().sub(center.p).dot(other),b.p.clone().sub(center.p).dot(axis)));
   for(let j=0;j<unique.length;j++){const a=unique[j],b=unique[(j+1)%unique.length];if(positive)Emit(center,b,a);else Emit(center,a,b);}
 }
 geometry.dispose();
 const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));result.setIndex(Array.from({length:positions.length/3},(_,i)=>i));result.computeVertexNormals();result.computeBoundingBox();return result;
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
