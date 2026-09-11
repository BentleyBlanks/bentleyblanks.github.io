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
export function FractureGeometry(source){
 const normal=new THREE.Vector3(1,.28,.03).normalize();source.computeBoundingBox();const s=source.boundingBox.getSize(new THREE.Vector3()).x;
 const a=CutGeometry(source,normal,-s*.12,false),rest=CutGeometry(source,normal,-s*.12,true);
 const b=CutGeometry(rest,normal,s*.2,false),c=CutGeometry(rest,normal,s*.2,true);rest.dispose();
 return[a,b,c].filter(g=>g.attributes.position.count>12);
}
